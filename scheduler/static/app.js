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

function getEventId(date, name) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().substring(0, 10);
  return `${dateStr}-${name}`;
}

function getEventData(date, name, type) {
  return {
    id: getEventId(date, name),
    title: name,
    color: statusColors[type],
    textColor: statusTextColors[type],
    start: date,
    allDay: true,
    extendedProps: {
      lowerTitle: name.toLowerCase(),
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

async function deleteEvent(id) {
  try {
    await axios.delete(`/api/entries/${id}`);
  } catch (exc) {
    console.log(`Delete failed: ${exc}`);
    return false;
  }
  return true;
}

async function findDates(required, wanted) {
  let resp;
  try {
    resp = await axios.post(`/api/find-dates`, {required, wanted});
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

document.addEventListener('DOMContentLoaded', function () {
  const nameSelector = document.querySelector('#name');
  const requiredNamesSelector = document.querySelector('#required-names');
  const wantedNamesSelector = document.querySelector('#wanted-names');
  const searchButton = document.querySelector('#search-button');

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

    for (const field of [requiredNamesSelector, wantedNamesSelector]) {
      const opt2 = document.createElement('option');
      opt2.value = name;
      opt2.text = name;

      field.add(opt2);
      field.size = field.options.length;
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
    console.log(required, wanted);
    if (!required.length) {
      alert('Wähl mindestens eine benötigte Person aus.');
      return;
    }

    findDates(required, wanted);
  });

  const previousName = localStorage.getItem('name');
  if (previousName && Array.from(nameSelector.options).some(opt => opt.value === previousName)) {
    nameSelector.value = previousName;
  }

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
    events: {
      url: '/api/entries/',
      eventDataTransform: ({date, name, type}) => getEventData(date, name, type),
    },
    eventClick: async ({event}) => {
      if (confirm(`Eintrag ${event.title} (${event.start.toLocaleDateString('de')}) löschen?`)) {
        if (await deleteEvent(event.id)) {
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
