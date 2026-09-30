"""Extract the exception CPU context, not the crash-handler thread context.

Only emits addresses and instruction bytes needed for the camera investigation.
Does not dump account identifiers, Windows paths or arbitrary captured memory.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path


def analyze(path):
    data = path.read_bytes()
    if data[:4] != b'MDMP':
        raise ValueError('Expected a Windows minidump')
    count, directory = struct.unpack_from('<II', data, 8)
    streams = {}
    for i in range(count):
        kind, size, offset = struct.unpack_from('<III', data, directory + 12 * i)
        if offset + size > len(data):
            raise ValueError('Truncated stream')
        streams[kind] = (size, offset)
    architecture = struct.unpack_from('<H', data, streams[7][1])[0]
    if architecture != 9:
        raise ValueError('Only AMD64 exception contexts supported')
    exception = streams[6][1]
    code = struct.unpack_from('<I', data, exception + 8)[0]
    fault_address = struct.unpack_from('<Q', data, exception + 24)[0]
    size, context = struct.unpack_from('<II', data, exception + 160)
    if size < 256 or context + size > len(data):
        raise ValueError('Truncated exception context')
    registers = dict(zip(['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi',
                         'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'rip'],
                        struct.unpack_from('<17Q', data, context + 120)))
    ranges = []
    memory = streams.get(5)
    if memory:
        n = struct.unpack_from('<I', data, memory[1])[0]
        for i in range(n):
            start, length, offset = struct.unpack_from('<QII', data, memory[1] + 4 + 16 * i)
            if offset + length > len(data):
                raise ValueError('Truncated memory range')
            ranges.append((start, length, offset))
    def captured(address, length=1):
        for start, size, offset in ranges:
            if start <= address and address + length <= start + size:
                return data[offset + address - start:offset + address - start + length]
        return None
    modules = streams[4][1]
    n = struct.unpack_from('<I', data, modules)[0]
    image_base = None
    for i in range(n):
        base, size = struct.unpack_from('<QI', data, modules + 4 + i * 108)
        if base <= registers['rip'] < base + size:
            image_base = base
            break
    instruction = captured(registers['rip'], 7)
    known_camera_read = instruction == bytes.fromhex('80b9900b000000')
    return dict(dumpSha256=hashlib.sha256(data).hexdigest(), exceptionCode=hex(code),
                exceptionAddress=hex(fault_address), exceptionContextRIP=hex(registers['rip']),
                faultRva=None if image_base is None else hex(registers['rip'] - image_base),
                exceptionContextRCX=hex(registers['rcx']), instructionBytes=None if instruction is None else instruction.hex(),
                knownCameraCooldownRead=known_camera_read,
                instruction='cmp byte ptr [rcx + 0xb90], 0' if known_camera_read else None,
                calculatedReadAddress=hex(registers['rcx'] + 0xb90) if known_camera_read else None,
                sdkField='URaceSimCameraComponent.DoesCameraHaveCooldownAfterUse @ 0xb90' if known_camera_read else None,
                cameraObjectMemoryCaptured=captured(registers['rcx']) is not None,
                callerCodeAndLifetimeProven=False, rootCauseProven=False,
                limitations=['The exception context proves an invalid camera-field read, not its origin',
                             'Missing camera object memory and caller code prevent proving an out-of-bounds selection or object lifetime fault',
                             'A container readback does not prove that the runtime crash is fixed'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dump', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(analyze(args.dump), stream, indent=2)
