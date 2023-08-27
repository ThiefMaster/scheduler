from datetime import date
import locale
from collections import defaultdict

from flask import Flask, jsonify, render_template
from jinja2 import StrictUndefined
from marshmallow import fields
from werkzeug.exceptions import UnprocessableEntity

from scheduler.args import not_empty, use_kwargs
from scheduler.db import EntrySchema, EntryType, add_entry, db, delete_entry, get_entries, get_names


app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql:///scheduler'
app.config.from_envvar('SCHEDULER_CONFIG', silent=True)
app.jinja_options = {'undefined': StrictUndefined}
app.add_template_global({
    'imports': {
        'axios': 'https://cdn.skypack.dev/axios@1.4.0',
        '@fullcalendar/core': 'https://cdn.skypack.dev/@fullcalendar/core@6.1.8',
        '@fullcalendar/core/locales/de': 'https://cdn.skypack.dev/@fullcalendar/core@6.1.8/locales/de',
        '@fullcalendar/daygrid': 'https://cdn.skypack.dev/@fullcalendar/daygrid@6.1.8',
        '@fullcalendar/interaction': 'https://cdn.skypack.dev/@fullcalendar/interaction@6.1.8',
    }
}, 'import_map')
db.init_app(app)
locale.setlocale(locale.LC_ALL, 'de_DE.UTF-8')


@app.errorhandler(UnprocessableEntity)
def handle_upe(exc):
    data = getattr(exc, 'data', None)
    if data and 'messages' in data:
        # this error came from a webargs parsing failure
        response = jsonify(webargs_errors=data['messages'])
        response.status_code = exc.code
        return response
    raise exc  # not sure if that's correct, but not needed for now


@app.route('/')
def index():
    names = sorted(get_names(), key=str.lower)
    return render_template('index.html', names=names)


@app.get('/api/entries/')
@use_kwargs({
    'start': fields.Date(load_default=None),
    'end': fields.Date(load_default=None),
}, location='query')
def api_get_entries(start, end):
    entries = get_entries(start, end)
    return EntrySchema().dump(entries, many=True)


@app.post('/api/entries/')
@use_kwargs({
    'date': fields.Date(required=True),
    'name': fields.String(required=True, validate=not_empty),
    'type': fields.Enum(EntryType, required=True),
})
def api_add_entry(date, name, type):
    assert name != '__new'
    add_entry(date, name, type)
    db.session.commit()
    return '', 201


@app.delete('/api/entries/<date>/<path:name>')
@use_kwargs({
    'date': fields.Date(),
    'name': fields.String(),
})
def api_delete_entry(date, name):
    delete_entry(date, name)
    db.session.commit()
    return '', 204


@app.post('/api/find-dates')
@use_kwargs({
    'required': fields.List(fields.String(), required=True),
    'wanted': fields.List(fields.String(), load_default=lambda: []),
    'start': fields.Date(load_default=date.today, allow_none=True),
})
def api_find_dates(required, wanted, start):
    required = set(required)
    wanted = set(wanted) - required
    entries = get_entries(start)
    by_day = defaultdict(list)
    for entry in entries:
        by_day[entry.date].append(entry)
    candidates = []
    for day, date_entries in by_day.items():
        available = {x.name for x in date_entries if x.type == EntryType.yes}
        ifneedbe = {x.name for x in date_entries if x.type == EntryType.ifneedbe}
        maybe = {x.name for x in date_entries if x.type == EntryType.maybe}
        unavailable = {x.name for x in date_entries if x.type == EntryType.no}
        if (available | ifneedbe | maybe) >= required:
            candidates.append({
                'day': day,
                'required_available': available & required,
                'required_ifneedbe': ifneedbe & required,
                'required_maybe': maybe & required,
                'wanted_available': available & wanted,
                'wanted_ifneedbe': ifneedbe & wanted,
                'wanted_maybe': maybe & wanted,
                'wanted_unavailable': unavailable & wanted,
                'wanted_noreply': wanted - {x.name for x in date_entries},
            })
    candidates.sort(key=lambda x: (
        -len(x['required_available']),
        -len(x['required_maybe']),
        -len(x['required_ifneedbe']),
        -len(x['wanted_available']),
        -len(x['wanted_maybe']),
        -len(x['wanted_ifneedbe']),
        len(x['wanted_noreply']),
        len(x['wanted_unavailable']),
        x['day'],
    ))
    res = [{
        'day': data['day'],
        'required': sorted(required),
        'wanted': sorted(wanted),
        'required_available': sorted(data['required_available']),
        'required_ifneedbe': sorted(data['required_ifneedbe']),
        'required_maybe': sorted(data['required_maybe']),
        'wanted_available': sorted(data['wanted_available']),
        'wanted_ifneedbe': sorted(data['wanted_ifneedbe']),
        'wanted_maybe': sorted(data['wanted_maybe']),
        'wanted_unavailable': sorted(data['wanted_unavailable']),
        'wanted_noreply': sorted(data['wanted_noreply']),
        'perfect': data['required_available'] == required and data['wanted_available'] == wanted,
    } for data in candidates]
    return {
        'count': len(res),
        'html': render_template('results.html', results=res) if res else None,
    }
