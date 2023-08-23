import errno
import json
from dataclasses import dataclass
from datetime import date
from enum import StrEnum, auto

from marshmallow import Schema, fields, post_load


class EntryType(StrEnum):
    maybe = auto()
    no = auto()
    ifneedbe = auto()
    yes = auto()


class EntrySchema(Schema):
    date = fields.Date(required=True)
    name = fields.String(required=True)
    type = fields.Enum(EntryType, required=True)

    @post_load
    def _post_load(self, data, **kwargs):
        return Entry(**data)


@dataclass
class Entry:
    date: date
    name: str
    type: EntryType

    @property
    def id(self):
        return f'{self.date}-{self.name}'


def _save_entries(entries):
    with open('entries.json', 'w') as f:
        json.dump(EntrySchema().dump(entries, many=True), f)


def load_entries():
    try:
        with open('entries.json') as f:
            data = json.load(f)
    except OSError as e:
        if e.errno == errno.ENOENT:
            return []
        raise
    return EntrySchema().load(data, many=True)


def get_entries():
    return EntrySchema().dump(load_entries(), many=True)


def add_entry(entry):
    entries = [x for x in load_entries() if x.id != entry.id]
    entries.append(entry)
    _save_entries(entries)


def delete_entry(id):
    entries = load_entries()
    _save_entries([x for x in entries if x.id != id])
