import secrets
import time


ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_id(prefix: str) -> str:
    if len(prefix) != 3 or not prefix.isalpha():
        raise ValueError("ID prefix must contain three letters")

    timestamp = int(time.time() * 1000)
    random_value = secrets.randbits(80)
    value = (timestamp << 80) | random_value

    characters: list[str] = []

    for _ in range(26):
        characters.append(ULID_ALPHABET[value & 31])
        value >>= 5

    ulid = "".join(reversed(characters))

    return f"{prefix.lower()}_{ulid}"