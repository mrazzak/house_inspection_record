const STORAGE_KEY = "finalinspect-state-v1";
const REPORT_KEY = "finalinspect-last-report-v1";
const DB_NAME = "finalinspect-db";
const STORE_NAME = "inspections";

const defaultLocations = [
  "Exterior - Front",
  "Exterior - Rear",
  "First Floor - Entrance",
  "First Floor - Hallway",
  "Main Kitchen",
  "Dining Room",
  "Living Room",
  "Primary Bedroom",
  "Primary Bathroom",
  "Guest Bathroom",
  "Laundry Room",
  "Garage",
  "Mechanical Room",
  "Second Floor - Hallway",
  "Basement"
];

const defaultTypes = [
  "Doors",
  "Walls",
  "Faucets",
  "Waterline",
  "Gas Line",
  "Electrical Outlets",
  "Appliances",
  "Flooring",
  "Windows",
  "Cabinets",
  "HVAC",
  "Safety"
];

const defaultCriteria = [
  { id: crypto.randomUUID(), type: "Doors", item: "Door alignment and latch operation" },
  { id: crypto.randomUUID(), type: "Walls", item: "Wall finish, paint, cracks, and texture" },
  { id: crypto.randomUUID(), type: "Faucets", item: "Faucet operation, leaks, and caulking" },
  { id: crypto.randomUUID(), type: "Waterline", item: "Visible waterline leaks or damage" },
  { id: crypto.randomUUID(), type: "Gas Line", item: "Gas line labeling, shutoff access, and visible defects" },
  { id: crypto.randomUUID(), type: "Electrical Outlets", item: "Outlet function, cover plates, and GFCI where required" },
  { id: crypto.randomUUID(), type: "Appliances", item: "Installed appliance condition and operation" }
];

const defaultTemplate = {
  floors: 2,
  bedrooms: 3,
  bathrooms: 2,
  basement: "None",
  legalSuite: "No",
  propertyStyle: "Detached",
  ensuite: "Yes",
  fireplaces: 1,
  atticInsulation: "Yes"
};

const defaultState = {
  address: "",
  propertyType: "Residential",
  inspector: "",
  inspectionDate: new Date().toISOString().slice(0, 10),
  locations: defaultLocations,
  types: defaultTypes,
  criteria: defaultCriteria,
  template: defaultTemplate,
  exteriorPhotos: [],
  checks: defaultCriteria.map((criterion) => ({
    id: crypto.randomUUID(),
    criteriaId: criterion.id,
    type: criterion.type,
    item: criterion.item,
    location: "First Floor - Entrance",
    status: "Pass",
    notes: "",
    photos: []
  }))
};

let state = structuredClone(defaultState);
let activePhotoHandler = null;
let reportDialog = null;
let toastTimer = null;

async function loadState() {
  try {
    const saved = await idbGet(STORAGE_KEY);
    return saved ? { ...structuredClone(defaultState), ...saved } : structuredClone(defaultState);
  } catch {
    try {
      const legacy = localStorage.getItem(STORAGE_KEY);
      return legacy ? { ...structuredClone(defaultState), ...JSON.parse(legacy) } : structuredClone(defaultState);
    } catch {
      return structuredClone(defaultState);
    }
  }
}

function saveState() {
  return idbSet(STORAGE_KEY, state).catch(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      alert("This device could not save the latest change. Remove a few photos or free browser storage, then try again.");
    }
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function photoToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function resizeImage(dataUrl, maxWidth = 1400, quality = 0.76) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function handlePhotoInput(files, targetPhotos) {
  for (const file of [...files]) {
    const dataUrl = await photoToDataUrl(file);
    const resized = await resizeImage(dataUrl);
    targetPhotos.push({
      id: crypto.randomUUID(),
      name: file.name || "Inspection photo",
      createdAt: new Date().toISOString(),
      dataUrl: resized
    });
  }
  saveAndRender();
}

function saveAndRender() {
  saveState();
  render();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  children.forEach((child) => node.append(child));
  return node;
}

function render() {
  const app = document.querySelector("#app");
  const deficiencies = state.checks.filter((check) => check.status === "Deficiency");
  app.innerHTML = "";
  app.append(
    renderHeader(deficiencies.length),
    renderPropertyPanel(),
    renderTemplatePanel(),
    renderExteriorPhotos(),
    renderChecks(deficiencies.length),
    renderLibrary(),
    renderFooter()
  );
  if (activePhotoHandler) app.append(renderPhotoChoiceDialog());
  if (reportDialog) app.append(renderReportDialog());
}

function renderHeader(deficiencyCount) {
  return el("header", { class: "topbar" }, [
    el("div", {}, [
      el("p", { class: "eyebrow", text: "Final inspection" }),
      el("h1", { text: "Final Inspection Record Application" })
    ]),
    el("div", { class: "topbar-actions" }, [
      el("button", {
        class: "secondary-action",
        type: "button",
        onClick: saveInspectionNow
      }, [
        icon("save"),
        el("span", { text: "Save" })
      ]),
      el("button", {
        class: "primary-action",
        type: "button",
        onClick: exportPdf
      }, [
        icon("file-text"),
        el("span", { text: deficiencyCount ? `PDF report (${deficiencyCount})` : "PDF report" })
      ])
    ])
  ]);
}

function renderPropertyPanel() {
  return el("section", { class: "panel property-grid" }, [
    field("Address", "textarea", state.address, (value) => (state.address = value), "Property address"),
    field("Property type", "select", state.propertyType, (value) => (state.propertyType = value), "", ["Residential", "Commercial"]),
    field("Inspector", "input", state.inspector, (value) => (state.inspector = value), "Inspector name"),
    field("Inspection date", "date", state.inspectionDate, (value) => (state.inspectionDate = value))
  ]);
}

function renderTemplatePanel() {
  return el("section", { class: "panel" }, [
    sectionTitle("Preloaded Template", "Generate a checklist from the property layout."),
    el("div", { class: "template-grid" }, [
      numberField("Floors", state.template.floors, (value) => (state.template.floors = clampNumber(value, 1, 6))),
      numberField("Bedrooms", state.template.bedrooms, (value) => (state.template.bedrooms = clampNumber(value, 0, 12))),
      numberField("Bathrooms", state.template.bathrooms, (value) => (state.template.bathrooms = clampNumber(value, 0, 12))),
      field("Basement", "select", state.template.basement, (value) => (state.template.basement = value), "", ["None", "Unfinished", "Finished"]),
      field("Legal suite", "select", state.template.legalSuite, (value) => (state.template.legalSuite = value), "", ["No", "Yes"]),
      field("Property style", "select", state.template.propertyStyle, (value) => (state.template.propertyStyle = value), "", ["Detached", "Semi-detached", "Duplex", "Townhome", "Condo", "Commercial"]),
      field("Ensuite", "select", state.template.ensuite, (value) => (state.template.ensuite = value), "", ["Yes", "No"]),
      numberField("Fireplaces", state.template.fireplaces, (value) => (state.template.fireplaces = clampNumber(value, 0, 8))),
      field("Attic insulation", "select", state.template.atticInsulation, (value) => (state.template.atticInsulation = value), "", ["Yes", "No"])
    ]),
    el("div", { class: "template-actions" }, [
      el("button", { class: "primary-action", type: "button", onClick: generateTemplateChecks }, [
        icon("layout-template"),
        el("span", { text: "Generate checklist" })
      ])
    ])
  ]);
}

function numberField(label, value, onChange) {
  return field(label, "number", value, onChange);
}

function clampNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function field(label, type, value, onChange, placeholder = "", options = []) {
  const id = `${label}-${crypto.randomUUID()}`;
  let control;
  if (type === "select") {
    control = el("select", { id }, options.map((option) => el("option", { value: option, text: option })));
    control.value = value;
  } else if (type === "textarea") {
    control = el("textarea", { id, placeholder, rows: "3" });
    control.value = value;
  } else {
    control = el("input", { id, type, placeholder });
    control.value = value;
  }
  control.addEventListener("change", () => {
    onChange(control.value);
    saveState();
  });
  control.addEventListener("input", () => {
    onChange(control.value);
    saveState();
  });
  return el("label", { class: `field ${type === "textarea" ? "wide" : ""}` }, [
    el("span", { text: label }),
    control
  ]);
}

function renderExteriorPhotos() {
  return el("section", { class: "panel" }, [
    sectionTitle("Property Exterior", "Start the report with address and outside photos."),
    photoToolbar((files) => handlePhotoInput(files, state.exteriorPhotos)),
    photoGrid(state.exteriorPhotos, (id) => {
      state.exteriorPhotos = state.exteriorPhotos.filter((photo) => photo.id !== id);
      saveAndRender();
    })
  ]);
}

function renderChecks(deficiencyCount) {
  const groupedChecks = groupChecksByLocation(state.checks);
  return el("main", { class: "panel checks-panel" }, [
    sectionTitle("Inspection Checks", deficiencyCount ? `${deficiencyCount} deficiency item${deficiencyCount === 1 ? "" : "s"} marked for the report.` : "Mark every item as pass, monitor, or deficiency."),
    ...groupedChecks.map(([location, checks]) => renderCheckGroup(location, checks)),
    el("button", { class: "secondary-action full", type: "button", onClick: addBlankCheck }, [
      icon("plus"),
      el("span", { text: "Add inspection check" })
    ])
  ]);
}

function groupChecksByLocation(checks) {
  const groups = new Map();
  checks.forEach((check) => {
    const location = check.location || "Unassigned Location";
    if (!groups.has(location)) groups.set(location, []);
    groups.get(location).push(check);
  });
  return [...groups.entries()].sort(([a], [b]) => locationSortIndex(a) - locationSortIndex(b) || a.localeCompare(b));
}

function locationSortIndex(location) {
  const index = state.locations.indexOf(location);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function renderCheckGroup(location, checks) {
  const deficiencies = checks.filter((check) => check.status === "Deficiency").length;
  return el("section", { class: "check-group" }, [
    el("div", { class: "check-group-head" }, [
      el("div", {}, [
        el("h3", { text: location }),
        el("p", { text: `${checks.length} inspection item${checks.length === 1 ? "" : "s"}` })
      ]),
      deficiencies ? el("span", { class: "deficiency-pill", text: `${deficiencies} deficiency` }) : el("span", { class: "pass-pill", text: "No deficiencies" })
    ]),
    ...checks.map(renderCheckCard)
  ]);
}

function renderCheckCard(check) {
  const typeSelect = selectControl(state.types, check.type, (value) => {
    check.type = value;
    saveAndRender();
  });
  const locationSelect = selectControl(state.locations, check.location, (value) => {
    check.location = value;
    saveAndRender();
  });
  const statusSelect = selectControl(["Pass", "Monitor", "Deficiency"], check.status, (value) => {
    check.status = value;
    saveAndRender();
  });
  const notes = el("textarea", { rows: "3", placeholder: "Notes, measurement, required correction, responsible trade..." });
  notes.value = check.notes;
  notes.addEventListener("input", () => {
    check.notes = notes.value;
    saveState();
  });

  const item = el("input", { type: "text", value: check.item, placeholder: "Inspection item" });
  item.addEventListener("input", () => {
    check.item = item.value;
    saveState();
  });

  return el("article", { class: `check-card ${check.status === "Deficiency" ? "is-deficiency" : ""}` }, [
    el("div", { class: "check-head" }, [
      el("div", { class: "check-title-row" }, [
        el("span", { class: "item-emoji", text: inspectionEmoji(check) }),
        el("div", { class: "check-type" }, [typeSelect])
      ]),
      el("button", { class: "icon-button danger", type: "button", title: "Remove check", onClick: () => removeCheck(check.id) }, [icon("trash")])
    ]),
    el("label", { class: "field compact" }, [el("span", { text: "Item" }), item]),
    el("div", { class: "triple-grid" }, [
      labeledControl("Location", locationSelect),
      labeledControl("Status", statusSelect),
      el("label", { class: "field compact" }, [
        el("span", { text: "Evidence" }),
        photoButton((files) => handlePhotoInput(files, check.photos))
      ])
    ]),
    el("label", { class: "field compact" }, [el("span", { text: "Notes" }), notes]),
    photoGrid(check.photos, (id) => {
      check.photos = check.photos.filter((photo) => photo.id !== id);
      saveAndRender();
    })
  ]);
}

function inspectionEmoji(check) {
  const source = `${check.type} ${check.item}`.toLowerCase();
  if (source.includes("door")) return "🚪";
  if (source.includes("wall") || source.includes("paint") || source.includes("ceiling")) return "🧱";
  if (source.includes("faucet") || source.includes("sink") || source.includes("shower") || source.includes("toilet")) return "🚰";
  if (source.includes("waterline") || source.includes("water line") || source.includes("supply line")) return "💧";
  if (source.includes("gas")) return "🔥";
  if (source.includes("electrical") || source.includes("outlet") || source.includes("gfci") || source.includes("panel")) return "🔌";
  if (source.includes("appliance") || source.includes("range") || source.includes("dishwasher") || source.includes("refrigerator")) return "🍳";
  if (source.includes("floor")) return "▦";
  if (source.includes("window") || source.includes("glass")) return "🪟";
  if (source.includes("cabinet") || source.includes("counter")) return "▤";
  if (source.includes("hvac") || source.includes("fan") || source.includes("duct")) return "🌬️";
  if (source.includes("safety") || source.includes("alarm") || source.includes("egress")) return "🛡️";
  if (source.includes("fireplace")) return "🪵";
  if (source.includes("attic") || source.includes("insulation")) return "🏠";
  if (source.includes("exterior") || source.includes("siding") || source.includes("grading")) return "🏡";
  if (source.includes("suite")) return "🏘️";
  return "✓";
}

function labeledControl(label, control) {
  return el("label", { class: "field compact" }, [el("span", { text: label }), control]);
}

function selectControl(options, value, onChange) {
  const select = el("select", {}, options.map((option) => el("option", { value: option, text: option })));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function renderLibrary() {
  const newTypeInput = el("input", { type: "text", placeholder: "New type, e.g. Roofing" });
  const newLocationInput = el("input", { type: "text", placeholder: "New location, e.g. Third Floor - Unit 302" });
  const criteriaType = selectControl(state.types, state.types[0], () => {});
  const criteriaItem = el("input", { type: "text", placeholder: "New inspection criteria" });

  return el("section", { class: "panel library-panel" }, [
    sectionTitle("Inspection Library", "Add criteria, item types, and dropdown locations."),
    el("div", { class: "library-grid" }, [
      addBox("Locations", state.locations, newLocationInput, () => addListValue("locations", newLocationInput.value)),
      addBox("Types", state.types, newTypeInput, () => addListValue("types", newTypeInput.value)),
      el("div", { class: "library-box" }, [
        el("h3", { text: "Criteria" }),
        el("div", { class: "add-row" }, [criteriaType, criteriaItem, el("button", {
          class: "secondary-action",
          type: "button",
          onClick: () => addCriteria(criteriaType.value, criteriaItem.value)
        }, [icon("plus"), el("span", { text: "Add" })])]),
        el("div", { class: "chips" }, state.criteria.map((criterion) => el("button", {
          class: "chip",
          type: "button",
          title: "Add this criteria as a check",
          onClick: () => addCheckFromCriteria(criterion)
        }, [el("span", { text: `${criterion.type}: ${criterion.item}` })])))
      ])
    ])
  ]);
}

function addBox(title, values, input, onAdd) {
  return el("div", { class: "library-box" }, [
    el("h3", { text: title }),
    el("div", { class: "add-row" }, [
      input,
      el("button", { class: "secondary-action", type: "button", onClick: onAdd }, [icon("plus"), el("span", { text: "Add" })])
    ]),
    el("div", { class: "chips" }, values.map((value) => el("span", { class: "chip", text: value })))
  ]);
}

function sectionTitle(title, subtitle) {
  return el("div", { class: "section-title" }, [
    el("div", {}, [el("h2", { text: title }), el("p", { text: subtitle })])
  ]);
}

function photoToolbar(onFiles) {
  return el("div", { class: "photo-toolbar" }, [
    photoButton(onFiles, "Take or upload photos")
  ]);
}

function photoButton(onFiles, label = "Add photo") {
  return el("button", {
    class: "file-button",
    type: "button",
    onClick: () => {
      activePhotoHandler = onFiles;
      render();
    }
  }, [icon("camera"), el("span", { text: label })]);
}

function renderPhotoChoiceDialog() {
  return el("div", { class: "dialog-backdrop", onClick: closeDialogs }, [
    el("div", { class: "dialog", onClick: (event) => event.stopPropagation() }, [
      el("div", { class: "dialog-head" }, [
        el("h2", { text: "Add Photos" }),
        el("button", { class: "icon-button", type: "button", title: "Close", onClick: closeDialogs }, [icon("x")])
      ]),
      el("div", { class: "dialog-actions" }, [
        el("button", { class: "primary-action", type: "button", onClick: () => launchPhotoInput(true) }, [
          icon("camera"),
          el("span", { text: "Take photo" })
        ]),
        el("button", { class: "secondary-action", type: "button", onClick: () => launchPhotoInput(false) }, [
          icon("upload"),
          el("span", { text: "Upload photos" })
        ])
      ])
    ])
  ]);
}

function launchPhotoInput(useCamera) {
  const input = el("input", {
    class: "hidden-file",
    type: "file",
    accept: "image/*",
    multiple: ""
  });
  if (useCamera) input.setAttribute("capture", "environment");
  input.addEventListener("change", async () => {
    const handler = activePhotoHandler;
    activePhotoHandler = null;
    if (handler) await handler(input.files);
  });
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 30000);
}

function closeDialogs() {
  activePhotoHandler = null;
  reportDialog = null;
  render();
}

function photoGrid(photos, onRemove) {
  if (!photos.length) return el("div", { class: "empty-photos", text: "No photos added yet." });
  return el("div", { class: "photo-grid" }, photos.map((photo) => el("figure", {}, [
    el("img", { src: photo.dataUrl, alt: photo.name }),
    el("button", { class: "photo-remove", type: "button", title: "Remove photo", onClick: () => onRemove(photo.id) }, [icon("x")])
  ])));
}

function renderFooter() {
  return el("footer", { class: "footer" }, [
    el("button", { class: "ghost-action", type: "button", onClick: resetInspection }, [icon("rotate-ccw"), el("span", { text: "Reset current inspection" })])
  ]);
}

async function saveInspectionNow() {
  await saveState();
  showToast("Inspection saved on this device.");
}

function showToast(message) {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();
  const toast = el("div", { class: "toast", text: message });
  document.body.append(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 2600);
}

function generateTemplateChecks() {
  const hasInspectionWork = state.checks.some((check) => check.notes || check.photos.length || check.status !== "Pass");
  if (state.checks.length && hasInspectionWork && !confirm("Generate a new checklist? Existing check notes, statuses, and evidence photos will be replaced.")) return;
  const template = state.template;
  const locations = buildTemplateLocations(template);
  const checks = buildTemplateChecks(template, locations);
  state.locations = uniqueValues([...state.locations, ...locations]);
  state.types = uniqueValues([...state.types, "Plumbing", "Attic", "Insulation", "Fireplace", "Exterior", "Suite"]);
  state.checks = checks;
  saveAndRender();
  showToast(`${checks.length} checklist items generated.`);
}

function buildTemplateLocations(template) {
  const locations = ["Exterior - Front", "Exterior - Rear", "Garage", "Main Kitchen", "Living Room", "Laundry Room", "Mechanical Room"];
  for (let floor = 1; floor <= template.floors; floor += 1) {
    const name = floorName(floor);
    locations.push(`${name} - Entrance`, `${name} - Hallway`);
  }
  for (let bedroom = 1; bedroom <= template.bedrooms; bedroom += 1) locations.push(`Bedroom ${bedroom}`);
  for (let bathroom = 1; bathroom <= template.bathrooms; bathroom += 1) locations.push(`Bathroom ${bathroom}`);
  if (template.ensuite === "Yes") locations.push("Primary Ensuite");
  if (template.basement !== "None") locations.push(`Basement - ${template.basement}`, "Basement - Mechanical");
  if (template.legalSuite === "Yes") locations.push("Basement Legal Suite - Kitchen", "Basement Legal Suite - Bathroom", "Basement Legal Suite - Bedroom", "Basement Legal Suite - Entrance");
  if (template.atticInsulation === "Yes") locations.push("Attic");
  return uniqueValues(locations);
}

function floorName(floor) {
  const names = ["First Floor", "Second Floor", "Third Floor", "Fourth Floor", "Fifth Floor", "Sixth Floor"];
  return names[floor - 1] || `Floor ${floor}`;
}

function buildTemplateChecks(template, locations) {
  const checks = [];
  const add = (type, item, location) => checks.push({
    id: crypto.randomUUID(),
    criteriaId: "",
    type,
    item,
    location,
    status: "Pass",
    notes: "",
    photos: []
  });
  const commonRoomChecks = ["Wall finish, paint, cracks, and texture", "Door alignment and latch operation", "Window operation, glass, locks, and screens", "Electrical outlet function and cover plates", "Flooring finish, transitions, and visible damage"];

  add("Exterior", `${template.propertyStyle} exterior envelope, grading, siding, trim, and penetrations`, "Exterior - Front");
  add("Safety", "Address numbers, exterior lighting, handrails, guards, and final safety items", "Exterior - Front");
  add("Doors", "Exterior doors, weatherstripping, locksets, thresholds, and closers", "Exterior - Front");

  locations.filter((location) => !location.startsWith("Exterior") && location !== "Attic").forEach((location) => {
    commonRoomChecks.forEach((item) => add(item.startsWith("Electrical") ? "Electrical Outlets" : item.startsWith("Door") ? "Doors" : item.startsWith("Wall") ? "Walls" : item.startsWith("Flooring") ? "Flooring" : "Windows", item, location));
  });

  ["Main Kitchen", "Basement Legal Suite - Kitchen"].filter((location) => locations.includes(location)).forEach((location) => {
    add("Appliances", "Installed appliance condition, operation, anti-tip, and final fit", location);
    add("Faucets", "Sink faucet operation, leaks, caulking, and drainage", location);
    add("Waterline", "Visible waterline leaks, shutoffs, dishwasher supply, and refrigerator supply", location);
    add("Gas Line", "Gas line labeling, shutoff access, and visible defects for range or appliance", location);
    add("Cabinets", "Cabinet doors, drawers, counters, backsplash, and hardware", location);
  });

  locations.filter((location) => location.includes("Bathroom") || location.includes("Ensuite")).forEach((location) => {
    add("Faucets", "Lavatory, tub, and shower operation, leaks, drainage, and caulking", location);
    add("Waterline", "Toilet, shutoff valves, supply lines, and visible leaks", location);
    add("Electrical Outlets", "GFCI protection and outlet cover plates", location);
    add("HVAC", "Exhaust fan operation and duct termination", location);
  });

  for (let fireplace = 1; fireplace <= template.fireplaces; fireplace += 1) {
    add("Fireplace", `Fireplace ${fireplace} finish, ignition, gas shutoff, clearance, and visible defects`, fireplace === 1 ? "Living Room" : `Fireplace ${fireplace}`);
    if (!state.locations.includes(`Fireplace ${fireplace}`) && fireplace > 1) locations.push(`Fireplace ${fireplace}`);
  }

  if (template.atticInsulation === "Yes") {
    add("Attic", "Attic access, insulation coverage, depth, baffles, ventilation, and visible moisture", "Attic");
    add("Insulation", "Attic insulation continuity around penetrations, hatches, and exterior walls", "Attic");
  }

  if (template.basement !== "None") {
    add("Walls", `${template.basement} basement wall, ceiling, floor, and stair finish`, `Basement - ${template.basement}`);
    add("Safety", "Basement egress, smoke/CO alarms, handrails, guards, and final safety checks", `Basement - ${template.basement}`);
  }

  if (template.legalSuite === "Yes") {
    add("Suite", "Legal suite fire separation, suite entry, alarms, egress, and labeling", "Basement Legal Suite - Entrance");
    add("Electrical Outlets", "Legal suite panel labeling, outlets, GFCI/AFCI where applicable", "Basement Legal Suite - Kitchen");
  }

  return checks;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function addBlankCheck() {
  state.checks.push({
    id: crypto.randomUUID(),
    criteriaId: "",
    type: state.types[0] || "General",
    item: "",
    location: state.locations[0] || "",
    status: "Pass",
    notes: "",
    photos: []
  });
  saveAndRender();
}

function addCheckFromCriteria(criterion) {
  state.checks.push({
    id: crypto.randomUUID(),
    criteriaId: criterion.id,
    type: criterion.type,
    item: criterion.item,
    location: state.locations[0] || "",
    status: "Pass",
    notes: "",
    photos: []
  });
  saveAndRender();
}

function removeCheck(id) {
  state.checks = state.checks.filter((check) => check.id !== id);
  saveAndRender();
}

function addListValue(key, rawValue) {
  const value = rawValue.trim();
  if (!value || state[key].includes(value)) return;
  state[key].push(value);
  saveAndRender();
}

function addCriteria(type, rawItem) {
  const item = rawItem.trim();
  if (!item) return;
  const criterion = { id: crypto.randomUUID(), type, item };
  state.criteria.push(criterion);
  addCheckFromCriteria(criterion);
}

function resetInspection() {
  if (!confirm("Reset the current inspection? Library items will stay available.")) return;
  state.address = "";
  state.inspector = "";
  state.inspectionDate = new Date().toISOString().slice(0, 10);
  state.exteriorPhotos = [];
  state.checks = state.criteria.map((criterion) => ({
    id: crypto.randomUUID(),
    criteriaId: criterion.id,
    type: criterion.type,
    item: criterion.item,
    location: state.locations[0] || "",
    status: "Pass",
    notes: "",
    photos: []
  }));
  saveAndRender();
}

async function exportPdf() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("The PDF engine did not load. Refresh the app and try again.");
    return;
  }
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 44;
  let y = margin;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const deficiencies = state.checks.filter((check) => check.status === "Deficiency");

  const ensureRoom = (height = 60) => {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addText = (text, size = 10, color = "#1f2d2f", style = "normal", gap = 14) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text || "", contentWidth);
    ensureRoom(lines.length * gap + 6);
    doc.text(lines, margin, y);
    y += lines.length * gap + 8;
  };

  doc.setFillColor("#244b5a");
  doc.rect(0, 0, pageWidth, 92, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Final Inspection Report", margin, 42);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${state.propertyType} property | ${state.inspectionDate || "No date"}`, margin, 66);
  y = 116;

  addText("Property Address", 12, "#244b5a", "bold");
  addText(state.address || "No address entered.", 11);
  addText(`Inspector: ${state.inspector || "Not specified"}`, 10);

  if (deficiencies.length) {
    ensureRoom(80);
    doc.setFillColor("#fff0f0");
    doc.setDrawColor("#cc2f2f");
    doc.roundedRect(margin, y, contentWidth, 42, 6, 6, "FD");
    doc.setTextColor("#a51e1e");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Deficiencies: ${deficiencies.length} item${deficiencies.length === 1 ? "" : "s"} require correction`, margin + 14, y + 26);
    y += 62;
    deficiencies.forEach((check, index) => {
      addText(`${index + 1}. ${check.type} - ${check.item}`, 11, "#a51e1e", "bold");
      addText(`Location: ${check.location}`, 10, "#1f2d2f");
      if (check.notes) addText(`Notes: ${check.notes}`, 10, "#1f2d2f");
    });
  } else {
    addText("No deficiencies marked at the time this report was generated.", 11, "#2c6d4a", "bold");
  }

  await addPhotoSection(doc, "Exterior Property Photos", state.exteriorPhotos, ensureRoom, () => y, (value) => (y = value), margin, contentWidth);

  addText("Inspection Checklist", 14, "#244b5a", "bold", 16);
  for (const check of state.checks) {
    ensureRoom(74);
    const isDeficiency = check.status === "Deficiency";
    doc.setFillColor(isDeficiency ? "#fff5f5" : "#f7faf9");
    doc.setDrawColor(isDeficiency ? "#cc2f2f" : "#d9e2df");
    doc.roundedRect(margin, y, contentWidth, 58, 4, 4, "FD");
    doc.setTextColor(isDeficiency ? "#a51e1e" : "#1f2d2f");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${check.status} | ${check.type}`, margin + 12, y + 18);
    doc.setTextColor("#1f2d2f");
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(`${check.item} | ${check.location}`, contentWidth - 24), margin + 12, y + 34);
    y += 72;
    if (check.notes) addText(`Notes: ${check.notes}`, 9);
    await addPhotoSection(doc, "Evidence Photos", check.photos, ensureRoom, () => y, (value) => (y = value), margin, contentWidth, true);
  }

  const safeAddress = (state.address || "inspection").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 42);
  const filename = `${safeAddress || "inspection"}-final-report.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  reportDialog = { blob, url, filename };
  render();
  showToast("PDF report generated.");
}

function renderReportDialog() {
  return el("div", { class: "dialog-backdrop", onClick: closeDialogs }, [
    el("div", { class: "dialog report-dialog", onClick: (event) => event.stopPropagation() }, [
      el("div", { class: "dialog-head" }, [
        el("div", {}, [
          el("h2", { text: "PDF Report Ready" }),
          el("p", { text: reportDialog.filename })
        ]),
        el("button", { class: "icon-button", type: "button", title: "Close", onClick: closeDialogs }, [icon("x")])
      ]),
      el("div", { class: "dialog-actions" }, [
        el("a", { class: "primary-action", href: reportDialog.url, target: "_blank", rel: "noopener" }, [
          icon("external-link"),
          el("span", { text: "Open PDF" })
        ]),
        el("a", { class: "secondary-action", href: reportDialog.url, download: reportDialog.filename }, [
          icon("download"),
          el("span", { text: "Download" })
        ]),
        el("button", { class: "secondary-action", type: "button", onClick: saveGeneratedReport }, [
          icon("save"),
          el("span", { text: "Save report" })
        ])
      ])
    ])
  ]);
}

async function saveGeneratedReport() {
  if (!reportDialog) return;
  await idbSet(REPORT_KEY, {
    filename: reportDialog.filename,
    blob: reportDialog.blob,
    savedAt: new Date().toISOString()
  });
  showToast("PDF report saved on this device.");
}

async function addPhotoSection(doc, title, photos, ensureRoom, getY, setY, margin, contentWidth, compact = false) {
  if (!photos.length) return;
  let y = getY();
  const pageHeight = doc.internal.pageSize.getHeight();
  const imageWidth = compact ? 112 : 156;
  const imageHeight = compact ? 84 : 110;
  const gap = 10;
  const perRow = Math.max(1, Math.floor((contentWidth + gap) / (imageWidth + gap)));

  ensureRoom(34);
  y = getY();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 10 : 13);
  doc.setTextColor("#244b5a");
  doc.text(title, margin, y);
  y += compact ? 18 : 24;

  for (let index = 0; index < photos.length; index++) {
    const col = index % perRow;
    if (col === 0 && y + imageHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    const x = margin + col * (imageWidth + gap);
    doc.addImage(photos[index].dataUrl, "JPEG", x, y, imageWidth, imageHeight, undefined, "FAST");
    if (col === perRow - 1 || index === photos.length - 1) y += imageHeight + gap;
  }
  setY(y + 8);
}

function icon(name) {
  const paths = {
    "file-text": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8 M8 9h1",
    plus: "M12 5v14 M5 12h14",
    save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",
    "layout-template": "M3 3h18v18H3z M3 9h18 M9 21V9",
    camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
    "external-link": "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3",
    trash: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6",
    x: "M18 6 6 18 M6 6l12 12",
    "rotate-ccw": "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5"
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<path d="${paths[name]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

state = await loadState();
render();
