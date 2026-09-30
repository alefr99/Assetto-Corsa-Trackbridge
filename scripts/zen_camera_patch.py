"""UE 5.1-only helpers for preserving cooked exports and package dependencies.

Layouts follow retoc v0.1.5 container_header.rs and CUE4Parse's
FZenPackageSummary, FExportMapEntry and IoPackage export bundle traversal.
Unsupported versions and changed object identities fail closed.
"""
import struct


def require(condition, message):
    if not condition:
        raise ValueError(message)


def container_entries(data):
    magic, version, container_id, count = struct.unpack_from('<IIQI', data)
    require(magic == 0x496F436E and version == 2, 'Expected UE5.1 OptionalSegmentPackages header')
    require(0 < count <= 10000 and 24 + count * 8 <= len(data), 'Invalid package count')
    ids = struct.unpack_from('<' + 'Q' * count, data, 20)
    size = struct.unpack_from('<I', data, 20 + count * 8)[0]
    buf = data[24 + count * 8:24 + count * 8 + size]
    require(len(buf) == size and count * 24 <= size, 'Truncated package store')
    result = {}
    for i, package_id in enumerate(ids):
        base = i * 24
        exports, bundles, ni, oi, ns, os = struct.unpack_from('<iiIIII', buf, base)
        require(exports > 0 and bundles > 0, 'Invalid export/bundle counts')
        require(not ni or base + 8 + oi + ni * 8 <= size, 'Invalid import array')
        require(not ns or base + 16 + os + ns * 20 <= size, 'Invalid shader array')
        imports = struct.unpack_from('<' + 'Q' * ni, buf, base + 8 + oi) if ni else ()
        shaders = tuple(buf[base + 16 + os + j * 20:base + 16 + os + (j + 1) * 20] for j in range(ns))
        require(package_id not in result, 'Duplicate package ID')
        result[package_id] = (exports, bundles, imports, shaders)
    return container_id, result


def zen_layout(data, bundle_count=11):
    require(len(data) >= 44, 'Truncated Zen summary')
    versioned, header_size = struct.unpack_from('<II', data)
    require(versioned == 0 and 44 <= header_size <= len(data), 'Expected unversioned UE5.1 package')
    hashes, imports, exports, entries, graph = struct.unpack_from('<iiiii', data, 24)
    require(44 <= hashes <= imports <= exports <= entries <= graph <= header_size, 'Invalid Zen offsets')
    require((entries - exports) % 72 == 0, 'Invalid export map size')
    count = (entries - exports) // 72
    require(count == 208 and entries + count * 16 == graph, 'Unexpected Bahrain export count')
    require(graph + bundle_count * 16 <= header_size, 'Truncated bundle headers')
    records = [data[exports + i * 72:exports + (i + 1) * 72] for i in range(count)]
    commands = [struct.unpack_from('<II', data, entries + i * 8) for i in range(count * 2)]
    physical = {}
    position = header_size
    for b in range(bundle_count):
        serial_offset, first, n = struct.unpack_from('<QII', data, graph + b * 16)
        require(first + n <= len(commands), 'Invalid bundle range')
        require(serial_offset == position - header_size, 'Unexpected bundle serial offset')
        for index, command in commands[first:first + n]:
            require(index < count and command in (0, 1), 'Invalid export command')
            if command == 1:
                require(index not in physical, 'Duplicate serialized export')
                size = struct.unpack_from('<Q', records[index], 8)[0]
                require(position + size <= len(data), 'Truncated export payload')
                physical[index] = (position, size)
                position += size
    require(len(physical) == count and position == len(data), 'Unaccounted export data')
    return dict(header_size=header_size, hashes=hashes, imports=imports, exports=exports,
                entries=entries, graph=graph, records=records, physical=physical)


def preserve_other_exports(original, edited, changed_indices):
    before, after = zen_layout(original), zen_layout(edited)
    # All object references retain the exact import map and public export hashes.
    require(original[before['hashes']:before['exports']] == edited[after['hashes']:after['exports']], 'Import identities changed')
    require(original[before['entries']:before['graph']] == edited[after['entries']:after['graph']], 'Export bundle commands changed')
    for i in range(208):
        require(before['records'][i][16:] == after['records'][i][16:], 'Export object identity changed: ' + str(i))
    for b in range(11):
        require(original[before['graph'] + b * 16 + 8:before['graph'] + (b + 1) * 16] ==
                edited[after['graph'] + b * 16 + 8:after['graph'] + (b + 1) * 16], 'Bundle membership changed')
    require(original[before['graph'] + 176:before['header_size']] == edited[after['graph'] + 176:after['header_size']], 'External dependency graph changed')
    changed = set(changed_indices)
    require(all(type(i) is int and 0 <= i < 208 for i in changed), 'Invalid patch export index')
    result = bytearray(edited)
    preserved = 0
    for i in range(208):
        if i in changed:
            continue
        start, size = before['physical'][i]
        target, target_size = after['physical'][i]
        require(size == target_size, 'Unpatched export size changed: ' + str(i))
        result[target:target + size] = original[start:start + size]
        preserved += 1
    return bytes(result), preserved
