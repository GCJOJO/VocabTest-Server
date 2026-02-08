const listEl = document.getElementById("word-list");
const totalCountEl = document.getElementById("total-count");
const statusEl = document.getElementById("status-text");
const formEl = document.getElementById("word-form");
const cancelEditBtn = document.getElementById("cancel-edit");
const saveButton = document.getElementById("save-button");
const searchInput = document.getElementById("search-input");
const refreshBtn = document.getElementById("refresh");
const sortSelect = document.getElementById("sort-select");
const pageSizeSelect = document.getElementById("page-size");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");
const pageInfoEl = document.getElementById("page-info");
const sortableHeaders = document.querySelectorAll("[data-sort]");

const fieldId = document.getElementById("word-id");
const idFieldWrapper = document.getElementById("id-field");
const fieldFrench = document.getElementById("word-french");
const fieldContext = document.getElementById("word-context");
const fieldEnglish = document.getElementById("word-english");

let wordsCache = [];
let currentPage = 1;
let pageSize = Number(pageSizeSelect.value || 10);
let sortKey = "id";
let sortDir = "asc";
const preferencesKey = "vocab-admin-preferences";

function loadPreferences() {
  try {
    const raw = localStorage.getItem(preferencesKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function savePreferences() {
  localStorage.setItem(
    preferencesKey,
    JSON.stringify({ sortKey, sortDir, pageSize })
  );
}

function syncSelectsWithSort() {
  const targetValue = `${sortKey}:${sortDir}`;
  const hasOption = Array.from(sortSelect.options).some(
    (option) => option.value === targetValue
  );
  if (hasOption) {
    sortSelect.value = targetValue;
  }
}

function getWordId(word) {
    console.log(word)
  if (!word) {
    return "";
  }
  return word.identifiant;
}

function setStatus(text) {
  //statusEl.textContent = text;
}

function clearForm() {
  fieldId.value = "";
  fieldFrench.value = "";
  fieldContext.value = "";
  fieldEnglish.value = "";
  saveButton.textContent = "Ajouter";
  fieldId.setAttribute("readonly", "readonly");
  idFieldWrapper.classList.add("is-hidden");
}

function loadWords() {
  setStatus("Chargement...");
  return fetch("/vocab-test")
    .then((response) => response.json())
    .then((data) => {
      wordsCache = Array.isArray(data.words) ? data.words : [];
      renderWords();
      setStatus("Pret");
    })
    .catch(() => {
      setStatus("Erreur reseau");
    });
}

function renderWords() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = wordsCache.filter((word) => {
    const french = String(word["français"] || "").toLowerCase();
    const context = String(word.contexte || "").toLowerCase();
    const english = String(word.anglais || "").toLowerCase();
    return (
      french.includes(query) || context.includes(query) || english.includes(query)
    );
  });

  const sorted = filtered.sort((a, b) => {
    const compare = (valueA, valueB) => {
      if (typeof valueA === "number" && typeof valueB === "number") {
        return valueA - valueB;
      }
      return String(valueA || "").localeCompare(String(valueB || ""), "fr");
    };

    let valueA;
    let valueB;
    switch (sortKey) {
      case "fr":
        valueA = a["français"];
        valueB = b["français"];
        break;
      case "en":
        valueA = a.anglais;
        valueB = b.anglais;
        break;
      case "context":
        valueA = a.contexte;
        valueB = b.contexte;
        break;
      default:
        valueA = Number(getWordId(a));
        valueB = Number(getWordId(b));
        break;
    }

    const result = compare(valueA, valueB);
    return sortDir === "asc" ? result : -result;
  });

  totalCountEl.textContent = String(sorted.length);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  pageInfoEl.textContent = `Page ${currentPage} / ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;

  listEl.innerHTML = "";

  if (!paged.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun mot trouve";
    listEl.appendChild(empty);
    return;
  }

  paged.forEach((word) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.setAttribute("role", "row");

    row.innerHTML = `
      <div class="cell">${getWordId(word) ?? ""}</div>
      <div class="cell">${word["français"] ?? ""}</div>
      <div class="cell">${word.contexte ?? ""}</div>
      <div class="cell">${word.anglais ?? ""}</div>
      <div class="cell actions">
        <button class="chip" type="button" data-action="edit">Modifier</button>
        <button class="danger" type="button" data-action="delete">Supprimer</button>
      </div>
    `;

    row.querySelector("[data-action='edit']").addEventListener("click", () => {
      fieldId.value = getWordId(word);
      fieldFrench.value = word["français"] ?? "";
      fieldContext.value = word.contexte ?? "";
      fieldEnglish.value = word.anglais ?? "";
      saveButton.textContent = "Modifier";
      fieldId.setAttribute("readonly", "readonly");
      idFieldWrapper.classList.remove("is-hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    row
      .querySelector("[data-action='delete']")
      .addEventListener("click", () => removeWord(getWordId(word)));

    listEl.appendChild(row);
  });
}

function saveWord(payload, isEdit) {
  const endpoint = isEdit ? "/change-word" : "/add-word";
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then(() => loadWords());
    
}

function removeWord(id) {
  if (!confirm("Supprimer ce mot ?")) {
    return;
  }

  fetch("/remove-word", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id }),
  })
    .then((response) => response.json())
    .then(() => loadWords());
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const isEdit = Boolean(fieldId.value);
  const payload = {
    id: fieldId.value || undefined,
    french: fieldFrench.value.trim(),
    context: fieldContext.value.trim(),
    english: fieldEnglish.value.trim(),
  };

  if (!payload.french || !payload.context || !payload.english) {
    setStatus("Complete tous les champs");
    return;
  }

  saveWord(payload, isEdit).then(() => {
    clearForm();
  });
});

cancelEditBtn.addEventListener("click", () => {
  clearForm();
});

searchInput.addEventListener("input", () => {
  currentPage = 1;
  renderWords();
});

sortSelect.addEventListener("change", () => {
  const [key, direction] = sortSelect.value.split(":");
  sortKey = key;
  sortDir = direction || "asc";
  currentPage = 1;
  savePreferences();
  renderWords();
});

pageSizeSelect.addEventListener("change", () => {
  pageSize = Number(pageSizeSelect.value || 10);
  currentPage = 1;
  savePreferences();
  renderWords();
});

prevPageBtn.addEventListener("click", () => {
  currentPage = Math.max(1, currentPage - 1);
  renderWords();
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  renderWords();
});

refreshBtn.addEventListener("click", () => {
  loadWords();
});

sortableHeaders.forEach((header) => {
  header.addEventListener("click", () => {
    const key = header.dataset.sort;
    if (!key) {
      return;
    }
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
    syncSelectsWithSort();
    currentPage = 1;
    savePreferences();
    renderWords();
  });
});

const savedPrefs = loadPreferences();
if (savedPrefs) {
  if (savedPrefs.sortKey) {
    sortKey = savedPrefs.sortKey;
  }
  if (savedPrefs.sortDir) {
    sortDir = savedPrefs.sortDir;
  }
  if (savedPrefs.pageSize) {
    pageSize = Number(savedPrefs.pageSize) || pageSize;
    pageSizeSelect.value = String(pageSize);
  }
  syncSelectsWithSort();
}

clearForm();
loadWords();
