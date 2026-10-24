# Small, dependency-free configuration codec and HID report builder.
# NVM bytes 0..15 are reserved for this application. One write per changed save.
DEFAULT = ('K', 44, 0, 'K', 40, 0, 'A')
VERSION = '0.2.0'

def validate(values):
    if len(values) != 7:
        raise ValueError('FORMAT')
    result = []
    for offset in (0, 3):
        kind = values[offset]
        key = int(values[offset + 1])
        mods = int(values[offset + 2])
        if kind == 'K':
            if not 4 <= key <= 115 or not 0 <= mods <= 15:
                raise ValueError('KEY')
        elif kind == 'M':
            if key not in (1, 2, 4) or mods != 0:
                raise ValueError('MOUSE')
        else:
            raise ValueError('TYPE')
        result.extend((kind, key, mods))
    if values[6] not in ('A', 'R', 'S'):
        raise ValueError('CONTACT')
    result.append(values[6])
    return tuple(result)

def checksum(data):
    a = 0
    b = 0
    for value in data:
        a = (a + value) % 255
        b = (b + a) % 255
    return (b << 8) | a

def encode(values):
    values = validate(values)
    data = bytearray(16)
    data[0:4] = b'NTR1'
    for offset in (0, 3):
        data[4 + offset] = ord(values[offset])
        data[5 + offset] = values[offset + 1]
        data[6 + offset] = values[offset + 2]
    data[10] = ord(values[6])
    check = checksum(data[:14])
    data[14] = check & 255
    data[15] = check >> 8
    return data

def decode(data):
    if len(data) != 16 or data[:4] != b'NTR1':
        raise ValueError('HEADER')
    if checksum(data[:14]) != (data[14] | data[15] << 8):
        raise ValueError('CHECKSUM')
    return validate((chr(data[4]), data[5], data[6], chr(data[7]), data[8], data[9], chr(data[10])))

def load(memory):
    try:
        return decode(memory[:16])
    except (ValueError, IndexError):
        return DEFAULT

def save(memory, values):
    packed = encode(values)
    if len(memory) < 16:
        raise ValueError('STORAGE')
    if memory[:16] != packed:
        memory[:16] = packed
    if bytes(memory[:16]) != bytes(packed):
        raise ValueError('VERIFY')
    return decode(memory[:16])

def wire(values):
    return ' '.join(str(value) for value in values)

def reports(values, pressed):
    keyboard = bytearray(8)
    mouse = bytearray(4)
    keys = []
    for index in range(2):
        if not pressed[index]:
            continue
        offset = index * 3
        if values[offset] == 'K':
            keyboard[0] |= values[offset + 2]
            key = values[offset + 1]
            if key not in keys:
                keys.append(key)
        else:
            mouse[0] |= values[offset + 1]
    for index, key in enumerate(keys):
        keyboard[index + 2] = key
    return keyboard, mouse
