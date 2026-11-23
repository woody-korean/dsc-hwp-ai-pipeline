"""Pure-Python parser for Korean HWP 5.0 (OLE2/CFB binary) and HWPX (KS X 6101 OWPML ZIP+XML)."""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path
from typing import Any

# HWP 5.0 16-byte (8 WCHAR) control codes inside HWPTAG_PARA_TEXT (tag_id=67).
# Extended controls: 1,2,3,11,12,14,15,16,17,18,21,22,23
# Inline controls: 4,5,6,7,8,19,20
HWP_16BYTE_CTRLS = {
    1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
}

HWPTAG_PARA_TEXT = 67
HWPTAG_TABLE = 77
OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
ZIP_MAGIC = b"PK\x03\x04"
FREESECT = 0xFFFFFFFE


def _read_ole2_streams(data: bytes) -> dict[str, bytes]:
    """Parse MS-CFB (OLE2) container into a dictionary of stream_name -> raw bytes."""
    if len(data) < 512 or data[:8] != OLE2_MAGIC:
        raise ValueError("Not a valid OLE2/CFB HWP file.")

    sector_shift = struct.unpack_from("<H", data, 30)[0]
    sector_size = 1 << sector_shift
    mini_shift = struct.unpack_from("<H", data, 32)[0]
    mini_size = 1 << mini_shift
    num_fat_sectors = struct.unpack_from("<I", data, 44)[0]
    first_dir_sector = struct.unpack_from("<I", data, 48)[0]
    mini_cutoff = struct.unpack_from("<I", data, 56)[0]
    first_minifat_sector = struct.unpack_from("<I", data, 60)[0]
    num_minifat_sectors = struct.unpack_from("<I", data, 64)[0]
    first_difat_sector = struct.unpack_from("<I", data, 68)[0]
    num_difat_sectors = struct.unpack_from("<I", data, 72)[0]

    difat = list(struct.unpack_from("<109I", data, 76))
    curr_difat = first_difat_sector
    visited_difat: set[int] = set()
    for _ in range(num_difat_sectors):
        if curr_difat >= FREESECT or curr_difat in visited_difat:
            break
        visited_difat.add(curr_difat)
        off = (curr_difat + 1) * sector_size
        if off + sector_size > len(data):
            break
        entries = struct.unpack_from(f"<{sector_size // 4}I", data, off)
        difat.extend(entries[:-1])
        curr_difat = entries[-1]

    fat: list[int] = []
    for sec_id in difat[:num_fat_sectors]:
        if sec_id >= FREESECT:
            continue
        off = (sec_id + 1) * sector_size
        if off + sector_size <= len(data):
            fat.extend(struct.unpack_from(f"<{sector_size // 4}I", data, off))

    def read_chain(start_sec: int) -> bytes:
        out = bytearray()
        s = start_sec
        visited: set[int] = set()
        while s < FREESECT and s not in visited and s < len(fat):
            visited.add(s)
            off = (s + 1) * sector_size
            if off + sector_size <= len(data):
                out.extend(data[off : off + sector_size])
            s = fat[s]
        return bytes(out)

    dir_bytes = read_chain(first_dir_sector)
    minifat_bytes = (
        read_chain(first_minifat_sector)
        if num_minifat_sectors > 0 and first_minifat_sector < FREESECT
        else b""
    )
    minifat = (
        struct.unpack_from(f"<{len(minifat_bytes) // 4}I", minifat_bytes, 0)
        if minifat_bytes
        else ()
    )

    entries: list[tuple[str, int, int, int]] = []
    for i in range(0, len(dir_bytes), 128):
        entry = dir_bytes[i : i + 128]
        if len(entry) < 128:
            break
        name_len = struct.unpack_from("<H", entry, 64)[0]
        if name_len == 0:
            continue
        name = entry[: max(0, name_len - 2)].decode("utf-16le", errors="ignore")
        etype = entry[66]
        start_sec, size = struct.unpack_from("<II", entry, 116)
        entries.append((name, etype, start_sec, size))

    root_stream = b""
    for name, etype, start_sec, size in entries:
        if etype == 5:
            root_stream = read_chain(start_sec)[:size]
            break

    streams: dict[str, bytes] = {}
    for name, etype, start_sec, size in entries:
        if etype != 2 or size == 0:
            continue
        if size < mini_cutoff and root_stream and minifat:
            out = bytearray()
            s = start_sec
            visited: set[int] = set()
            while s < FREESECT and s not in visited and s < len(minifat):
                visited.add(s)
                off = s * mini_size
                out.extend(root_stream[off : off + mini_size])
                s = minifat[s]
            streams[name] = bytes(out[:size])
        else:
            streams[name] = read_chain(start_sec)[:size]

    return streams


def _decode_hwp_para_text(rec: bytes) -> str:
    """Decode an HWP 5.0 HWPTAG_PARA_TEXT (tag_id=67) record into clean text."""
    chars: list[str] = []
    idx = 0
    length = len(rec)
    while idx + 2 <= length:
        code = struct.unpack_from("<H", rec, idx)[0]
        if code in HWP_16BYTE_CTRLS:
            idx += 16
        elif code in (10, 13):
            chars.append("\n")
            idx += 2
        elif code == 9:
            chars.append("\t")
            idx += 2
        elif code in (24, 30, 31):
            chars.append(" ")
            idx += 2
        elif code < 32:
            idx += 2
        else:
            chars.append(chr(code))
            idx += 2
    return "".join(chars)


def parse_hwp_ole2(data: bytes) -> dict[str, Any]:
    """Parse an HWP 5.0 binary OLE2 document."""
    streams = _read_ole2_streams(data)
    fh = streams.get("FileHeader", b"")
    if len(fh) < 40 or not fh.startswith(b"HWP Document File"):
        raise ValueError("Invalid HWP 5.0 FileHeader signature.")

    ver_raw = struct.unpack_from("<I", fh, 32)[0]
    version_str = (
        f"{(ver_raw >> 24) & 0xFF}.{(ver_raw >> 16) & 0xFF}"
        f".{(ver_raw >> 8) & 0xFF}.{ver_raw & 0xFF}"
    )
    flags = struct.unpack_from("<I", fh, 36)[0]
    compressed = bool(flags & 0x01)
    encrypted = bool(flags & 0x02)
    if encrypted:
        raise ValueError("Encrypted/DRM-protected HWP file is not supported.")

    section_names = sorted(
        (n for n in streams if re.fullmatch(r"Section\d+", n)),
        key=lambda n: int(n.replace("Section", "")),
    )

    paragraphs: list[str] = []
    table_count = 0

    for sec_name in section_names:
        raw_sec = streams[sec_name]
        if compressed:
            try:
                sec_data = zlib.decompress(raw_sec, -15)
            except zlib.error:
                sec_data = zlib.decompress(raw_sec)
        else:
            sec_data = raw_sec

        pos = 0
        while pos + 4 <= len(sec_data):
            hdr = struct.unpack_from("<I", sec_data, pos)[0]
            pos += 4
            tag_id = hdr & 0x3FF
            rec_size = (hdr >> 20) & 0xFFF
            if rec_size == 0xFFF:
                if pos + 4 > len(sec_data):
                    break
                rec_size = struct.unpack_from("<I", sec_data, pos)[0]
                pos += 4
            rec = sec_data[pos : pos + rec_size]
            pos += rec_size

            if tag_id == HWPTAG_TABLE:
                table_count += 1
            elif tag_id == HWPTAG_PARA_TEXT:
                text = _decode_hwp_para_text(rec)
                for line in text.splitlines():
                    cleaned = re.sub(r"[ \t]+", " ", line).strip()
                    if cleaned:
                        paragraphs.append(cleaned)

    prv_text = ""
    if "PrvText" in streams:
        prv_text = streams["PrvText"].decode("utf-16le", errors="ignore").strip()

    extracted_text = "\n".join(paragraphs)
    return {
        "format_type": "HWP 5.0 Binary (OLE2/CFB)",
        "magic_hex": data[:8].hex(),
        "hwp_version": version_str,
        "compressed": compressed,
        "encrypted": encrypted,
        "streams": sorted(streams.keys()),
        "section_count": len(section_names),
        "table_count": table_count,
        "paragraph_count": len(paragraphs),
        "char_count": len(extracted_text),
        "preview_text": prv_text,
        "extracted_text": extracted_text,
        "tables": [],
    }


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _t_element_text(t_el: ET.Element) -> str:
    """Extract full text inside an OWPML <hp:t> element, including tails after spacing tags."""
    parts: list[str] = []
    if t_el.text:
        parts.append(t_el.text)
    for child in t_el:
        cname = _local_name(child.tag)
        if cname in ("fwSpace", "nbSpace", "tab"):
            parts.append(" ")
        elif cname == "lineBreak":
            parts.append("\n")
        elif cname == "hyphen":
            parts.append("-")
        else:
            sub_txt = "".join(child.itertext())
            if sub_txt:
                parts.append(sub_txt)
        if child.tail:
            parts.append(child.tail)
    return "".join(parts)


def _extract_hwpx_table(tbl_el: ET.Element) -> list[list[str]]:
    """Extract a 2D table of cell strings from an OWPML <hp:tbl> element."""
    rows: list[list[str]] = []
    for child in tbl_el:
        if _local_name(child.tag) == "tr":
            row: list[str] = []
            for tc in child:
                if _local_name(tc.tag) == "tc":
                    cell_parts: list[str] = []
                    for el in tc.iter():
                        if _local_name(el.tag) == "t":
                            txt = _t_element_text(el).strip()
                            if txt:
                                cell_parts.append(txt)
                    cell_text = re.sub(r"\s+", " ", " ".join(cell_parts)).strip()
                    row.append(cell_text)
            if any(row):
                rows.append(row)
    return rows


def _format_markdown_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    max_cols = max(len(r) for r in rows)
    norm_rows = [r + [""] * (max_cols - len(r)) for r in rows]
    lines = ["| " + " | ".join(c.replace("|", "/") for c in norm_rows[0]) + " |"]
    lines.append("| " + " | ".join("---" for _ in range(max_cols)) + " |")
    for r in norm_rows[1:]:
        lines.append("| " + " | ".join(c.replace("|", "/") for c in r) + " |")
    return "\n".join(lines)


def _walk_hwpx_paragraph(
    p_el: ET.Element, blocks: list[str], tables: list[list[list[str]]]
) -> None:
    """Extract paragraph text cleanly while converting nested <hp:tbl> blocks once."""
    inline_parts: list[str] = []
    for run in p_el:
        if _local_name(run.tag) != "run":
            continue
        for node in run:
            lname = _local_name(node.tag)
            if lname == "t":
                txt = _t_element_text(node)
                if txt:
                    inline_parts.append(txt)
            elif lname == "tbl":
                if inline_parts:
                    text = re.sub(r"\s+", " ", "".join(inline_parts)).strip()
                    if text:
                        blocks.append(text)
                    inline_parts.clear()
                tbl_rows = _extract_hwpx_table(node)
                if tbl_rows:
                    tables.append(tbl_rows)
                    blocks.append(_format_markdown_table(tbl_rows))
            else:
                for sub in node.iter():
                    if _local_name(sub.tag) == "t":
                        txt = _t_element_text(sub)
                        if txt:
                            inline_parts.append(txt)
    if inline_parts:
        text = re.sub(r"\s+", " ", "".join(inline_parts)).strip()
        if text:
            blocks.append(text)


def parse_hwpx_zip(data: bytes) -> dict[str, Any]:
    """Parse an HWPX (KS X 6101 OWPML ZIP+XML) document."""
    import io

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()
        section_files = sorted(
            (n for n in names if re.fullmatch(r"Contents/section\d+\.xml", n)),
            key=lambda n: int(re.search(r"\d+", n).group(0)),  # type: ignore[union-attr]
        )
        blocks: list[str] = []
        tables: list[list[list[str]]] = []

        for sec_file in section_files:
            root = ET.fromstring(zf.read(sec_file))
            for child in root:
                if _local_name(child.tag) == "p":
                    _walk_hwpx_paragraph(child, blocks, tables)

        prv_text = ""
        if "Preview/PrvText.txt" in names:
            prv_text = zf.read("Preview/PrvText.txt").decode("utf-8", errors="ignore").strip()

    extracted_text = "\n".join(blocks)
    return {
        "format_type": "HWPX (KS X 6101 OWPML ZIP+XML)",
        "magic_hex": data[:8].hex(),
        "hwp_version": "OWPML",
        "compressed": True,
        "encrypted": False,
        "streams": names,
        "section_count": len(section_files),
        "table_count": len(tables),
        "paragraph_count": len(blocks),
        "char_count": len(extracted_text),
        "preview_text": prv_text,
        "extracted_text": extracted_text,
        "tables": tables,
    }


def parse_hwp_bytes(data: bytes, filename: str = "") -> dict[str, Any]:
    """Auto-detect HWP 5.0 binary or HWPX ZIP+XML from magic bytes and parse."""
    if data[:8] == OLE2_MAGIC:
        res = parse_hwp_ole2(data)
    elif data[:4] == ZIP_MAGIC:
        res = parse_hwpx_zip(data)
    else:
        raise ValueError(
            f"Unsupported format for {filename or 'input'}: magic={data[:8].hex()}"
        )
    res["filename"] = filename
    res["file_size"] = len(data)
    return res


def parse_hwp_any(filepath: str | Path) -> dict[str, Any]:
    """Read a .hwp or .hwpx file from disk and return structured parse diagnostics + text."""
    p = Path(filepath)
    data = p.read_bytes()
    return parse_hwp_bytes(data, filename=p.name)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify pure-Python HWP/HWPX parser.")
    parser.add_argument(
        "--samples-dir",
        default=str(Path(__file__).resolve().parent.parent / "samples"),
        help="Directory containing .hwp/.hwpx files.",
    )
    parser.add_argument("--verify", action="store_true", help="Exit non-zero if any file fails.")
    parser.add_argument("--dump-json", help="Optional output path for parsed corpus JSON.")
    args = parser.parse_args()

    samples_dir = Path(args.samples_dir)
    files = sorted(
        list(samples_dir.glob("*.hwp")) + list(samples_dir.glob("*.hwpx"))
    )
    if not files:
        print(f"No .hwp or .hwpx files found in {samples_dir}", file=sys.stderr)
        return 1

    results = []
    for f in files:
        parsed = parse_hwp_any(f)
        print(
            f"[OK] {parsed['filename']} | {parsed['format_type']} | "
            f"size={parsed['file_size']:,}B | sections={parsed['section_count']} | "
            f"tables={parsed['table_count']} | paras={parsed['paragraph_count']} | "
            f"chars={parsed['char_count']:,}"
        )
        print("  Snippet:", parsed["extracted_text"][:160].replace("\n", " "))
        if args.verify and parsed["char_count"] < 50:
            print(f"[FAIL] Too little text extracted from {f}", file=sys.stderr)
            return 1
        results.append(parsed)

    if args.dump_json:
        Path(args.dump_json).write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote parsed corpus to {args.dump_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
