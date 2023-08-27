import {Calendar} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import deLocale from '@fullcalendar/core/locales/de';
import axios from 'axios';

const statusColors = {
  maybe: '#ccc',
  no: '#e81224',
  ifneedbe: '#fff100',
  yes: '#16c60c',
};

const statusTextColors = {
  maybe: '#000',
  no: '#fff',
  ifneedbe: '#000',
  yes: '#000',
};

const lastFetched = {start: null, end: null, data: null};
let nameFilterFunc = () => true;

function getEventId(date, name) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().substring(0, 10);
  return `${dateStr}-${name}`;
}

function getEventData(date, name, type) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().substring(0, 10);
  return {
    id: getEventId(dateStr, name),
    title: name,
    color: statusColors[type],
    textColor: statusTextColors[type],
    start: date,
    allDay: true,
    extendedProps: {
      lowerTitle: name.toLowerCase(),
      date: dateStr,
      name,
    },
  };
}

async function saveEvent(date, name, type, errorCB) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().substring(0, 10);
  try {
    await axios.post('/api/entries/', {date: dateStr, name, type});
  } catch (exc) {
    console.log(`Save failed: ${exc}`);
    errorCB();
  }
}

async function deleteEvent(date, name) {
  try {
    await axios.delete(`/api/entries/${date}/${name}`);
  } catch (exc) {
    console.log(`Delete failed: ${exc}`);
    return false;
  }
  return true;
}

async function findDates(required, wanted) {
  let resp;
  const params = {required, wanted};
  if (location.search.includes('allow-past=1')) {
    params.start = null;
  }
  try {
    resp = await axios.post(`/api/find-dates`, params);
  } catch (exc) {
    alert(`Finding dates failed: ${exc}`);
    return;
  }

  if (!resp.data.count) {
    alert('Keine passenden Termine gefunden');
    return;
  }

  const resultsDialog = document.querySelector('#results-dialog');
  const resultsContainer = document.querySelector('#results');
  resultsContainer.innerHTML = resp.data.html;
  resultsDialog.showModal();
}

async function fetchEvents(start, end) {
  const params = {
    start: start.toISOString().substring(0, 10),
    end: end.toISOString().substring(0, 10),
  };
  if (lastFetched.start === params.start && lastFetched.end === params.end) {
    return lastFetched.data;
  }
  let resp;
  try {
    resp = await axios.get(`/api/entries/`, params);
  } catch (exc) {
    console.log(`Fetch failed: ${exc}`);
    throw exc;
  }
  Object.assign(lastFetched, {start: params.start, end: params.end, data: resp.data});
  return resp.data;
}

document.addEventListener('DOMContentLoaded', function () {
  const nameSelector = document.querySelector('#name');
  const requiredNamesSelector = document.querySelector('#required-names');
  const wantedNamesSelector = document.querySelector('#wanted-names');
  const filterNamesSelector = document.querySelector('#filter-names');
  const filterIsBlacklistSelector = document.querySelector('#filter-blacklist');
  const searchButton = document.querySelector('#search-button');
  const resetFiltersButton = document.querySelector('#reset-filters-button');

  nameSelector.addEventListener('input', () => {
    if (nameSelector.value !== '__new') {
      localStorage.setItem('name', nameSelector.value);
      return;
    }

    const name = (prompt('Wer bist du?') || '').trim();
    if (!name) {
      nameSelector.value = '';
      return;
    }

    const opt = document.createElement('option');
    opt.value = name;
    opt.text = name;
    nameSelector.add(opt, nameSelector.options[nameSelector.options.length - 1]);
    nameSelector.value = name;

    let mustUpdateFilters = false;
    for (const field of [requiredNamesSelector, wantedNamesSelector, filterNamesSelector]) {
      const opt2 = document.createElement('option');
      opt2.value = name;
      opt2.text = name;
      // if we're using whitelist-based filtering and have a filter applied, select the new item
      if (
        field === filterNamesSelector &&
        !filterIsBlacklistSelector.checked &&
        filterNamesSelector.selectedOptions.length
      ) {
        opt2.selected = true;
        mustUpdateFilters = true;
      }

      field.add(opt2);
      field.size = field.options.length;
    }

    if (mustUpdateFilters) {
      updateFilter();
    }
  });

  requiredNamesSelector.addEventListener('input', () => {
    const selected = Array.from(requiredNamesSelector.selectedOptions).map(x => x.value);
    Array.from(wantedNamesSelector.options)
      .filter(opt => opt.value)
      .forEach(opt => {
        opt.disabled = selected.includes(opt.value);
        if (opt.disabled) {
          opt.selected = false;
        }
      });
  });
  requiredNamesSelector.dispatchEvent(new Event('input'));

  searchButton.addEventListener('click', () => {
    const required = Array.from(requiredNamesSelector.selectedOptions).map(x => x.value);
    const wanted = Array.from(wantedNamesSelector.selectedOptions).map(x => x.value);
    if (!required.length) {
      alert('Wähl mindestens eine benötigte Person aus.');
      return;
    }

    findDates(required, wanted);
  });

  const updateFilter = (refetch = true) => {
    const filterNames = new Set(Array.from(filterNamesSelector.selectedOptions).map(x => x.value));
    if (!filterNames.size) {
      nameFilterFunc = () => true;
    } else if (filterIsBlacklistSelector.checked) {
      nameFilterFunc = name => !filterNames.has(name);
    } else {
      nameFilterFunc = name => filterNames.has(name);
    }
    // filter name selectors
    Array.from(requiredNamesSelector.options)
      .slice(1)
      .concat(Array.from(wantedNamesSelector.options).slice(1))
      .forEach(opt => {
        const hidden = !nameFilterFunc(opt.value);
        opt.style.display = hidden ? 'none' : null;
        if (hidden) {
          opt.selected = false;
        }
      });
    // reload calendar
    if (refetch) {
      calendar.refetchEvents();
    }
    // save data
    localStorage.setItem('filter', JSON.stringify([...filterNames]));
    localStorage.setItem('filterBlacklist', JSON.stringify(filterIsBlacklistSelector.checked));
  };

  filterNamesSelector.addEventListener('input', updateFilter);
  filterIsBlacklistSelector.addEventListener('input', updateFilter);
  resetFiltersButton.addEventListener('click', () => {
    Array.from(filterNamesSelector.selectedOptions).forEach(opt => {
      opt.selected = false;
    });
    updateFilter();
  });

  const previousName = localStorage.getItem('name');
  if (previousName && Array.from(nameSelector.options).some(opt => opt.value === previousName)) {
    nameSelector.value = previousName;
  }

  const previousFilterBlacklist = JSON.parse(localStorage.getItem('filterBlacklist') || 'false');
  const previousFilter = new Set(JSON.parse(localStorage.getItem('filter') || '[]'));
  filterIsBlacklistSelector.checked = previousFilterBlacklist;
  Array.from(filterNamesSelector.options).forEach(opt => {
    opt.selected = previousFilter.has(opt.value);
  });
  updateFilter(false);

  const container = document.querySelector('#calendar');
  const calendar = new Calendar(container, {
    plugins: [dayGridPlugin, interactionPlugin],
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: '',
    },
    firstDay: 1,
    locale: deLocale,
    timeZone: 'Europe/Berlin',
    eventOrder: 'lowerTitle',
    events: async info => {
      const events = await fetchEvents(info.start, info.end);
      return events
        .filter(({name}) => nameFilterFunc(name))
        .map(({date, name, type}) => getEventData(date, name, type));
    },
    eventClick: async ({event}) => {
      if (confirm(`Eintrag ${event.title} (${event.start.toLocaleDateString('de')}) löschen?`)) {
        const {name, date} = event.extendedProps;
        if (await deleteEvent(date, name)) {
          event.remove();
        }
      }
    },
    selectable: true,
    select: info => {
      const name = nameSelector.value;
      const type = document.querySelector('select[name=type]').value;

      if (!name || name === '__new') {
        alert('Gib links oben an, wer du bist.');
        return;
      }

      if (!type) {
        alert('Wähl links oben einen Status aus.');
        return;
      }

      for (const date = info.start; date < info.end; date.setDate(date.getDate() + 1)) {
        const existing = calendar.getEventById(getEventId(date, name));
        if (existing) {
          existing.remove();
        }
        const event = calendar.addEvent(getEventData(date, name, type), true);
        saveEvent(date, name, type, () => {
          event.remove();
          if (existing) {
            calendar.addEvent(existing);
          }
        });
      }
    },
  });
  calendar.render();
});
