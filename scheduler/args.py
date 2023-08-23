from marshmallow import ValidationError
from webargs.flaskparser import FlaskParser
from werkzeug.datastructures import MultiDict


class CustomFlaskParser(FlaskParser):
    def _strip_whitespace(self, value):
        if isinstance(value, str):
            value = value.strip()
        elif isinstance(value, MultiDict):
            return type(value)((k, self._strip_whitespace(v)) for k, vals in value.lists() for v in vals)
        elif isinstance(value, dict):
            return {k: self._strip_whitespace(v) for k, v in value.items()}
        elif isinstance(value, (list, set)):
            return type(value)(map(self._strip_whitespace, value))
        return value

    def pre_load(self, location_data, *args, **kwargs):
        return self._strip_whitespace(location_data)


parser = CustomFlaskParser()
use_args = parser.use_args
use_kwargs = parser.use_kwargs


@parser.error_handler
def handle_error(error, req, schema, *, error_status_code, error_headers):
    namespaced = error.messages  # mutating this below is safe
    error.messages = namespaced.popitem()[1]
    assert not namespaced  # we never expect to have more than one location
    parser.handle_error(error, req, schema, error_status_code=error_status_code, error_headers=error_headers)


def not_empty(value):
    if not value:
        raise ValidationError('This field cannot be empty.')
