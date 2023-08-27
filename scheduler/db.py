from enum import StrEnum, auto

from flask_sqlalchemy import SQLAlchemy
from marshmallow import Schema, fields
from sqlalchemy.dialects.postgresql import insert


db = SQLAlchemy()


class EntryType(StrEnum):
    maybe = auto()
    no = auto()
    ifneedbe = auto()
    yes = auto()


class Entry(db.Model):
    __tablename__ = 'entries'
    date = db.Column(db.Date, nullable=False, primary_key=True)
    name = db.Column(db.String, nullable=False, primary_key=True)
    type = db.Column(db.Enum(EntryType), nullable=False)

    @property
    def id(self):
        return f'{self.date}-{self.name}'


class EntrySchema(Schema):
    date = fields.Date(required=True)
    name = fields.String(required=True)
    type = fields.Enum(EntryType, required=True)


def get_entries(start=None, end=None):
    query = db.select(Entry).order_by(Entry.date, Entry.name)
    if start:
        query = query.filter(Entry.date >= start)
    if end:
        query = query.filter(Entry.date < end)
    return db.session.scalars(query).all()


def get_names():
    return db.session.execute(db.select(Entry.name.distinct())).scalars().all()


def add_entry(date, name, type):
    db.session.execute(insert(Entry).values({'date': date, 'name': name, 'type': type})
                       .on_conflict_do_update('entries_pkey', set_={'type': type}))


def delete_entry(date, name):
    db.session.execute(db.delete(Entry).filter_by(date=date, name=name))
