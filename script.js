const STORAGE_KEY = "ariyamReports";
const API_BASE_URL = window.location.port === "3000" ? "" : "http://localhost:3000";
const REPORTS_API_URL = `${API_BASE_URL}/api/reports`;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const DEFAULT_MAP_CENTER = [10.8505, 76.2711]; // Kerala, roughly centered
const DEFAULT_MAP_ZOOM = 7;

const starterReports = [
  {
    eventName: "Tech Fest 2026",
    district: "Ernakulam",
    organisation: "Model Engineering College",
    hotelStay: "Yes",
    hotelRating: "4",
    hotelReview: "Clean rooms, safe area, and around 20 minutes from the venue.",
    foodSpots: "Kadavanthra meals shop, nearby tea stall, and budget biriyani spots.",
    touristPlaces: "Marine Drive and Fort Kochi after the event.",
    extraFeatures: "Metro access helped a lot. Book rooms early during fest season.",
    location: { lat: 9.9816, lng: 76.2999, address: "Kadavanthra, Kochi, Ernakulam" }
  },
  {
    eventName: "Literary Meet",
    district: "Thrissur",
    organisation: "St. Thomas College",
    hotelStay: "No",
    hotelRating: "Not rated",
    hotelReview: "Used same-day travel, so no hotel review.",
    foodSpots: "Round area has good vegetarian meals and evening snacks.",
    touristPlaces: "Thekkinkadu Maidan and Vadakkunnathan Temple surroundings.",
    extraFeatures: "Railway station access is convenient for students.",
    location: { lat: 10.5276, lng: 76.2144, address: "Thekkinkadu Maidan, Thrissur" }
  },
  {
    eventName: "Design Sprint",
    district: "Kozhikode",
    organisation: "Student Innovation Forum",
    hotelStay: "Yes",
    hotelRating: "5",
    hotelReview: "Affordable dorm stay, friendly staff, and good Wi-Fi.",
    foodSpots: "SM Street snacks, beach side tea, and local banana chips shops.",
    touristPlaces: "Kozhikode Beach and Mananchira Square.",
    extraFeatures: "Auto fares were reasonable, but evening traffic was heavy.",
    location: { lat: 11.2496, lng: 75.7826, address: "Kozhikode Beach, Kozhikode" }
  }
];

const reportForm = document.querySelector("#reportForm");
const reportsList = document.querySelector("#reportsList");
const resultSummary = document.querySelector("#resultSummary");
const topDistrictSearch = document.querySelector("#topDistrictSearch");
const heroDistrictSearch = document.querySelector("#heroDistrictSearch");
const topSearchForm = document.querySelector("#topSearchForm");
const heroSearchForm = document.querySelector("#heroSearchForm");
const districtRail = document.querySelector("#districtRail");
const statReports = document.querySelector("#statReports");
const statDistricts = document.querySelector("#statDistricts");

const touristMapsLinkInput = document.querySelector("#touristMapsLink");
const roomAmountInput = document.querySelector("#roomAmount");
const eventDaysInput = document.querySelector("#eventDays");
const hotelSearchInput = document.querySelector("#hotelSearchInput");
const hotelPlacesSuggestions = document.querySelector("#hotelPlacesSuggestions");
const hotelPlacesStatus = document.querySelector("#hotelPlacesStatus");
const selectedHotelCard = document.querySelector("#selectedHotelCard");
const loadPlacesButton = document.querySelector("#loadPlacesButton");
const hotelImageInput = document.querySelector("#hotelImages");
const touristImageInput = document.querySelector("#touristImages");
const hotelImagePreview = document.querySelector("#hotelImagePreview");
const touristImagePreview = document.querySelector("#touristImagePreview");

// Optional manual-pin UI (not present in the current markup, but the picker
// helpers below are written defensively so they still work if these are
// ever added back to the page).
const locationPickedAddress = document.querySelector("#locationPickedAddress");
const touristLocationPickedAddress = document.querySelector("#touristLocationPickedAddress");

let activeDistrict = "";
let pickedLocation = null; // { lat, lng, address } for the report currently being drafted
let touristPickedLocation = null;
let geocodeDebounceTimer = null;
let hotelImages = [];
let touristImages = [];
let hotelLocationPicker = null;
let touristLocationPicker = null;
let googlePlacesLoaded = false;
let autocompleteService = null;
let placesService = null;
let selectedHotelDetails = null;
let hotelAutocompleteInitialized = false;
let hotelAutocompleteDebounceTimer = null;

function renderLocationPreview() {
  const hotelValue = selectedHotelDetails?.googleMapsUrl || selectedHotelDetails?.name || "";
  const touristValue = touristMapsLinkInput?.value?.trim() || "";

  const preview = document.querySelector("#locationPreview");
  if (!preview) return;

  if (!hotelValue && !touristValue) {
    preview.innerHTML = "";
    return;
  }

  const items = [];
  if (hotelValue) {
    items.push(`<a href="${buildGoogleMapsUrl(hotelValue)}" target="_blank" rel="noopener noreferrer">Hotel: ${escapeHtml(hotelValue)}</a>`);
  }
  if (touristValue) {
    items.push(`<a href="${buildGoogleMapsUrl(touristValue)}" target="_blank" rel="noopener noreferrer">Tourist place: ${escapeHtml(touristValue)}</a>`);
  }

  preview.innerHTML = `<div class="detail-grid">${items.map((item) => `<div class="detail"><strong>Open in maps</strong><span>${item}</span></div>`).join("")}</div>`;
}

/* ============================================================
   Local storage helpers
   ============================================================ */

async function loadReports() {
  try {
    const response = await fetch(REPORTS_API_URL);
    if (response.ok) {
      const serverReports = await response.json();
      if (Array.isArray(serverReports)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverReports));
        return serverReports;
      }
    }
  } catch (error) {
    console.warn("Ariyam: API unavailable, falling back to local storage", error);
  }

  const savedReports = localStorage.getItem(STORAGE_KEY);

  if (!savedReports) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(starterReports));
    return starterReports;
  }

  try {
    const parsed = JSON.parse(savedReports);
    return Array.isArray(parsed) ? parsed : starterReports;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(starterReports));
    return starterReports;
  }
}

async function saveReport(report) {
  try {
    const response = await fetch(REPORTS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });

    if (!response.ok) {
      throw new Error("Could not save report to server");
    }
  } catch (error) {
    console.warn("Ariyam: server save failed, storing locally instead", error);
  }

  const existingReports = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  existingReports.unshift(report);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existingReports));
}

async function deleteReport(id) {
  try {
    const response = await fetch(`${REPORTS_API_URL}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Could not delete report from server");
    }
  } catch (error) {
    console.warn("Ariyam: server delete failed", error);
  }

  const existingReports = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const updatedReports = existingReports.filter((report) => report._id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedReports));
  await renderReports();
}

function initHotelSearchUI() {
  if (hotelAutocompleteInitialized || !hotelSearchInput) return;

  hotelAutocompleteInitialized = true;
  hotelSearchInput.addEventListener("input", handleHotelSearchInput);
  hotelSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleHotelSearchInput();
    }
  });
  showHotelStatus("Type a hotel name or area to search.");
}

async function searchHotelsWithNominatim(query) {
  const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&dedupe=1&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const results = await response.json();
    return results.map((item) => ({
      label: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      placeId: item.place_id,
      name: item.name || item.display_name,
      address: item.display_name,
      website: item.website || ""
    }));
  } catch (error) {
    console.warn("Ariyam: hotel fallback search failed", error);
    return [];
  }
}

function handleHotelSearchInput() {
  clearHotelSuggestions();
  const query = hotelSearchInput?.value?.trim();

  if (!query) {
    showHotelStatus("Type a hotel name or area to search.");
    return;
  }

  if (hotelAutocompleteDebounceTimer) {
    clearTimeout(hotelAutocompleteDebounceTimer);
  }

  hotelAutocompleteDebounceTimer = setTimeout(async () => {
    showHotelStatus("Searching hotels...");

    if (window.google?.maps?.places && window.google.maps.places.AutocompleteService) {
      autocompleteService = autocompleteService || new google.maps.places.AutocompleteService();
      placesService = placesService || new google.maps.places.PlacesService(document.createElement("div"));
      googlePlacesLoaded = true;
      autocompleteService.getPlacePredictions(
        { input: query, types: ["lodging"], componentRestrictions: { country: "in" } },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions?.length) {
            const suggestionList = document.createElement("div");
            suggestionList.className = "location-suggestions";
            predictions.forEach((prediction) => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "location-suggestion-btn";
              button.textContent = prediction.description;
              button.addEventListener("click", () => {
                selectHotelPlace(prediction.place_id);
              });
              suggestionList.appendChild(button);
            });

            if (hotelPlacesSuggestions) {
              hotelPlacesSuggestions.innerHTML = "";
              hotelPlacesSuggestions.appendChild(suggestionList);
            }
            showHotelStatus("Choose a hotel suggestion.");
            return;
          }
        }
      );
    }

    const fallbackResults = await searchHotelsWithNominatim(query);
    if (!fallbackResults.length) {
      showHotelStatus("No hotel results found. Try another name.");
      return;
    }

    const suggestionList = document.createElement("div");
    suggestionList.className = "location-suggestions";
    fallbackResults.forEach((result) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "location-suggestion-btn";
      button.textContent = result.label;
      button.addEventListener("click", () => {
        selectHotelPlace(null, result);
      });
      suggestionList.appendChild(button);
    });

    if (hotelPlacesSuggestions) {
      hotelPlacesSuggestions.innerHTML = "";
      hotelPlacesSuggestions.appendChild(suggestionList);
    }
    showHotelStatus("Choose a hotel suggestion.");
  }, 250);
}

function selectHotelPlace(placeId, placeDetails = null) {
  if (placeId && placesService) {
    showHotelStatus("Fetching hotel details...");
    const request = {
      placeId,
      fields: ["name", "formatted_address", "geometry", "place_id", "rating", "photos", "international_phone_number", "website", "url"]
    };

    placesService.getDetails(request, (place, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
        showHotelStatus("Could not load hotel details.", true);
        return;
      }

      selectedHotelDetails = {
        name: place.name || "",
        formattedAddress: place.formatted_address || "",
        latitude: place.geometry?.location?.lat?.() ?? null,
        longitude: place.geometry?.location?.lng?.() ?? null,
        placeId: place.place_id || "",
        rating: place.rating ?? null,
        photos: Array.isArray(place.photos) ? place.photos.slice(0, 3).map((photo) => photo.getUrl({ maxWidth: 800 })) : [],
        phoneNumber: place.international_phone_number || "",
        website: place.website || "",
        googleMapsUrl: place.url || buildGoogleMapsUrl(place.name || place.formatted_address || "")
      };

      if (hotelSearchInput) hotelSearchInput.value = selectedHotelDetails.name || "";
      clearHotelSuggestions();
      renderSelectedHotelCard();
      renderLocationPreview();
      showHotelStatus(`Selected ${selectedHotelDetails.name}`);
    });
    return;
  }

  if (!placeDetails) return;

  selectedHotelDetails = {
    name: placeDetails.name || "",
    formattedAddress: placeDetails.address || "",
    latitude: placeDetails.lat ?? null,
    longitude: placeDetails.lng ?? null,
    placeId: placeDetails.placeId || "",
    rating: null,
    photos: [],
    phoneNumber: "",
    website: placeDetails.website || "",
    googleMapsUrl: buildGoogleMapsUrl(placeDetails.address || placeDetails.name || "")
  };

  if (hotelSearchInput) hotelSearchInput.value = selectedHotelDetails.name || "";
  clearHotelSuggestions();
  renderSelectedHotelCard();
  renderLocationPreview();
  showHotelStatus(`Selected ${selectedHotelDetails.name}`);
}

/* ============================================================
   Small text helpers
   ============================================================ */

function cleanText(value) {
  return value.trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function matchesDistrict(report, district) {
  if (!district) return true;
  return report.district.toLowerCase().includes(district.toLowerCase());
}

function createDetail(label, value) {
  const detail = document.createElement("div");
  detail.className = "detail";

  if (label === "Hotel location" || label === "Tourist location") {
    const text = value ? escapeHtml(value) : "Not added yet";
    detail.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${text}</span>`;
    return detail;
  }

  detail.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(
    value || "Not added yet"
  )}</span>`;
  return detail;
}

function showHotelStatus(message, isError = false) {
  if (!hotelPlacesStatus) return;
  hotelPlacesStatus.textContent = message;
  hotelPlacesStatus.style.color = isError ? "#b42318" : "";
}

function clearHotelSuggestions() {
  if (hotelPlacesSuggestions) hotelPlacesSuggestions.innerHTML = "";
}

function renderSelectedHotelCard() {
  if (!selectedHotelCard) return;

  if (!selectedHotelDetails) {
    selectedHotelCard.innerHTML = "";
    return;
  }

  const photoUrl = selectedHotelDetails.photos?.[0] || "";
  const ratingText = selectedHotelDetails.rating ? `${selectedHotelDetails.rating}/5` : "Not rated";
  const phoneText = selectedHotelDetails.phoneNumber ? escapeHtml(selectedHotelDetails.phoneNumber) : "Not listed";
  const websiteText = selectedHotelDetails.website ? escapeHtml(selectedHotelDetails.website) : "Not listed";
  const addressText = selectedHotelDetails.formattedAddress ? escapeHtml(selectedHotelDetails.formattedAddress) : "No address";
  const latLng = selectedHotelDetails.latitude && selectedHotelDetails.longitude
    ? `${selectedHotelDetails.latitude},${selectedHotelDetails.longitude}`
    : "";

  const mapIframe = latLng
    ? `<iframe title="Hotel map" src="https://www.google.com/maps?q=${encodeURIComponent(latLng)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
    : "";

  selectedHotelCard.innerHTML = `
    <div class="detail">
      <strong>Selected hotel</strong>
      <div class="report-location-block">
        <h4>${escapeHtml(selectedHotelDetails.name || "Hotel")}</h4>
        <p><strong>Address:</strong> ${addressText}</p>
        <p><strong>Rating:</strong> ${escapeHtml(ratingText)}</p>
        <p><strong>Phone:</strong> ${phoneText}</p>
        <p><strong>Website:</strong> <a href="${escapeHtml(selectedHotelDetails.website || "#")}" target="_blank" rel="noopener noreferrer">${websiteText}</a></p>
        <p><strong>Google Maps:</strong> <a href="${escapeHtml(selectedHotelDetails.googleMapsUrl || "#")}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a></p>
        ${photoUrl ? `<img class="report-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(selectedHotelDetails.name || "Hotel photo")}" />` : ""}
        ${mapIframe}
      </div>
    </div>
  `;
}

function createHotelDetailsBlock(hotelDetails) {
  if (!hotelDetails) return null;

  const block = document.createElement("div");
  block.className = "detail";

  const photoUrl = hotelDetails.photos?.[0] || "";
  const ratingText = hotelDetails.rating ? `${hotelDetails.rating}/5` : "Not rated";
  const addressText = hotelDetails.formattedAddress || "No address";
  const latLng = hotelDetails.latitude && hotelDetails.longitude
    ? `${hotelDetails.latitude},${hotelDetails.longitude}`
    : "";
  const mapIframe = latLng
    ? `<iframe title="Hotel map" src="https://www.google.com/maps?q=${encodeURIComponent(latLng)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
    : "";

  block.innerHTML = `
    <strong>Selected hotel</strong>
    <div class="report-location-block">
      <h4>${escapeHtml(hotelDetails.name || "Hotel")}</h4>
      <p><strong>Address:</strong> ${escapeHtml(addressText)}</p>
      <p><strong>Rating:</strong> ${escapeHtml(ratingText)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(hotelDetails.phoneNumber || "Not listed")}</p>
      <p><strong>Website:</strong> <a href="${escapeHtml(hotelDetails.website || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(hotelDetails.website || "Not listed")}</a></p>
      <p><strong>Google Maps:</strong> <a href="${escapeHtml(hotelDetails.googleMapsUrl || "#")}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a></p>
      ${photoUrl ? `<img class="report-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(hotelDetails.name || "Hotel photo")}" />` : ""}
      ${mapIframe}
    </div>
  `;
  return block;
}

function buildGoogleMapsUrl(query) {
  if (!query) return null;
  const encoded = encodeURIComponent(query.trim());
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function createPostmark(district, index) {
  const pathId = `postmark-path-${index}`;
  const label = `• ${district.toUpperCase()} `;
  return `
    <svg class="postmark" viewBox="0 0 76 76" aria-hidden="true">
      <defs>
        <path id="${pathId}" d="M 8,38 A 30,30 0 1 1 68,38" fill="none" />
      </defs>
      <circle cx="38" cy="38" r="30" class="postmark-district" />
      <text class="postmark-text">
        <textPath href="#${pathId}" startOffset="0%">${escapeHtml(label.repeat(2))}</textPath>
      </text>
    </svg>
  `;
}

function ratingLabel(report) {
  if (report.hotelStay === "No") return "Day trip, no hotel stay";
  if (report.hotelRating === "Not rated") return "Hotel stayed, not rated";
  return `Hotel rated ${report.hotelRating}/5`;
}

function updateStats(reports) {
  const districts = new Set(reports.map((report) => report.district));
  statReports.textContent = reports.length;
  statDistricts.textContent = districts.size;
}

/* ============================================================
   Geocoding (OpenStreetMap Nominatim — free, no API key)
   ============================================================ */

async function forwardGeocode(query) {
  if (!query || query.trim().length < 3) return [];
  const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&q=${encodeURIComponent(
    query
  )}`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const results = await response.json();
    return results.map((item) => ({
      label: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    }));
  } catch (error) {
    console.error("Ariyam: forward geocode failed", error);
    return [];
  }
}

async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_URL}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const result = await response.json();
    return result.display_name || null;
  } catch (error) {
    console.error("Ariyam: reverse geocode failed", error);
    return null;
  }
}

/* ============================================================
   Directions helpers
   ============================================================ */

// Hands off to the visitor's own maps app, routed from wherever they are to
// the *exact* pinned coordinates — this keeps directions accurate instead of
// depending on a typed address that might be spelled inconsistently.
function buildDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

function buildOsmUrl(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

function createDirectionsActions(lat, lng) {
  const wrapper = document.createElement("div");
  wrapper.className = "report-location-actions";

  const directionsLink = document.createElement("a");
  directionsLink.className = "directions-btn";
  directionsLink.href = buildDirectionsUrl(lat, lng);
  directionsLink.target = "_blank";
  directionsLink.rel = "noopener noreferrer";
  directionsLink.innerHTML = `
    <svg viewBox="0 0 20 20"><path d="M10 2 L17 17 L10 13 L3 17 Z" /></svg>
    Get directions
  `;

  const osmLink = document.createElement("a");
  osmLink.className = "directions-btn";
  osmLink.href = buildOsmUrl(lat, lng);
  osmLink.target = "_blank";
  osmLink.rel = "noopener noreferrer";
  osmLink.textContent = "View on map";

  wrapper.append(directionsLink, osmLink);
  return wrapper;
}

/* ============================================================
   Location picker map (only wires up if the containers exist)
   ============================================================ */

function initLocationPicker(options) {
  const mapEl = document.querySelector(options.mapSelector);
  if (!mapEl || typeof L === "undefined") {
    return { resetPin: () => {} };
  }

  const map = L.map(mapEl).setView(options.center || DEFAULT_MAP_CENTER, options.zoom || DEFAULT_MAP_ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  let marker = null;

  async function setPin(lat, lng, addressOverride = null) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        setPin(position.lat, position.lng);
      });
    }
    map.setView([lat, lng], 15);

    if (options.addressOutput) {
      options.addressOutput.textContent = addressOverride ? addressOverride : "Looking up the address...";
      options.addressOutput.classList.toggle("is-empty", !addressOverride);
    }

    if (addressOverride) {
      options.onPinChange?.({ lat, lng, address: addressOverride });
      return;
    }

    const address = await reverseGeocode(lat, lng);
    const location = { lat, lng, address };
    options.onPinChange?.(location);

    if (options.addressOutput) {
      options.addressOutput.textContent = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      options.addressOutput.classList.remove("is-empty");
    }
  }

  map.on("click", (event) => setPin(event.latlng.lat, event.latlng.lng));

  const searchInput = document.querySelector(options.searchInputSelector);
  const searchButton = document.querySelector(options.searchButtonSelector);
  const suggestionsBox = document.querySelector(options.suggestionsSelector);

  function clearSuggestions() {
    if (suggestionsBox) suggestionsBox.innerHTML = "";
  }

  async function runSearch(query) {
    const results = await forwardGeocode(query);
    if (!suggestionsBox) return;
    clearSuggestions();

    results.forEach((result) => {
      const option = document.createElement("button");
      option.type = "button";
      option.textContent = result.label;
      option.addEventListener("click", () => {
        setPin(result.lat, result.lng);
        if (searchInput) searchInput.value = result.label;
        clearSuggestions();
      });
      suggestionsBox.appendChild(option);
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(geocodeDebounceTimer);
      const value = searchInput.value;
      geocodeDebounceTimer = setTimeout(() => runSearch(value), 450);
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch(searchInput.value);
      }
    });
  }

  if (searchButton) {
    searchButton.addEventListener("click", () => runSearch(searchInput ? searchInput.value : ""));
  }

  document.addEventListener("click", (event) => {
    if (suggestionsBox && !suggestionsBox.contains(event.target) && event.target !== searchInput) {
      clearSuggestions();
    }
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.setView([position.coords.latitude, position.coords.longitude], 12);
      },
      () => {
        /* silently keep the default Kerala view */
      },
      { timeout: 4000 }
    );
  }

  return {
    resetPin: () => {
      if (marker) {
        marker.remove();
        marker = null;
      }
      if (options.addressOutput) {
        options.addressOutput.textContent = options.emptyMessage;
        options.addressOutput.classList.add("is-empty");
      }
      options.onPinChange?.(null);
    }
  };
}

function renderImagePreview(previewEl, images) {
  if (!previewEl) return;

  previewEl.innerHTML = "";

  if (!images.length) {
    const empty = document.createElement("p");
    empty.className = "image-preview-empty";
    empty.textContent = "No images selected yet.";
    previewEl.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "image-preview-grid";

  images.forEach((image, index) => {
    const card = document.createElement("div");
    card.className = "image-preview-card";

    const img = document.createElement("img");
    img.src = image.dataUrl;
    img.alt = image.name || "Uploaded image";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "image-preview-remove";
    removeButton.innerHTML = "×";
    removeButton.addEventListener("click", () => {
      images.splice(index, 1);
      renderImagePreview(previewEl, images);
    });

    card.append(img, removeButton);
    grid.appendChild(card);
  });

  previewEl.appendChild(grid);
}

async function handleImageSelection(inputEl, previewEl, imageList) {
  if (!inputEl?.files?.length) return;

  const fileEntries = Array.from(inputEl.files);
  const loadedImages = await Promise.all(
    fileEntries.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        })
    )
  );

  imageList.push(...loadedImages.filter(Boolean));
  renderImagePreview(previewEl, imageList);
  inputEl.value = "";
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) return [];

  return photos
    .map((photo) => {
      if (!photo) return null;
      if (typeof photo === "string") {
        return { name: "Uploaded image", dataUrl: photo };
      }
      const dataUrl = photo.dataUrl || photo.src || photo.url;
      if (!dataUrl) return null;
      return { name: photo.name || "Uploaded image", dataUrl };
    })
    .filter(Boolean);
}

function createPhotoGallery(photos, title) {
  const normalizedPhotos = normalizePhotos(photos);
  if (!normalizedPhotos.length) return null;

  const mediaBlock = document.createElement("div");
  mediaBlock.className = "report-media";

  const titleEl = document.createElement("div");
  titleEl.className = "report-location-title";
  titleEl.textContent = title;
  mediaBlock.appendChild(titleEl);

  const gallery = document.createElement("div");
  gallery.className = "report-photos";

  normalizedPhotos.forEach((photo) => {
    const img = document.createElement("img");
    img.className = "report-photo";
    img.src = photo.dataUrl;
    img.alt = photo.name || title;
    gallery.appendChild(img);
  });

  mediaBlock.appendChild(gallery);
  return mediaBlock;
}

function createLocationBlock(title, location, containerId, label) {
  const locationBlock = document.createElement("div");
  locationBlock.className = "report-location-block";

  const titleEl = document.createElement("div");
  titleEl.className = "report-location-title";
  titleEl.textContent = title;
  locationBlock.appendChild(titleEl);

  const mapDiv = document.createElement("div");
  mapDiv.id = containerId;
  mapDiv.className = "ariyam-leaflet-box report-mini-map";
  locationBlock.appendChild(mapDiv);
  locationBlock.appendChild(createDirectionsActions(location.lat, location.lng));

  requestAnimationFrame(() => {
    createMiniMap(containerId, location.lat, location.lng, label || title);
  });

  return locationBlock;
}

function resetLocationPickerUI() {
  pickedLocation = null;
  touristPickedLocation = null;
  hotelImages = [];
  touristImages = [];
  selectedHotelDetails = null;
  if (hotelSearchInput) hotelSearchInput.value = "";
  clearHotelSuggestions();
  showHotelStatus("Type a hotel name or area to search.");
  renderImagePreview(hotelImagePreview, hotelImages);
  renderImagePreview(touristImagePreview, touristImages);
  renderSelectedHotelCard();
  renderLocationPreview();

  if (locationPickedAddress) {
    locationPickedAddress.textContent = "No location pinned yet.";
    locationPickedAddress.classList.add("is-empty");
  }

  if (touristLocationPickedAddress) {
    touristLocationPickedAddress.textContent = "No tourist place pinned yet.";
    touristLocationPickedAddress.classList.add("is-empty");
  }

  hotelLocationPicker?.resetPin();
  touristLocationPicker?.resetPin();
}

/* ============================================================
   Mini map on each report card
   ============================================================ */

function createMiniMap(containerId, lat, lng, label) {
  const mapEl = document.getElementById(containerId);
  if (!mapEl || typeof L === "undefined") return null;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const map = L.map(mapEl, {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false
  }).setView([lat, lng], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  L.marker([lat, lng]).addTo(map).bindPopup(label || "Reported location");

  return map;
}

/* ============================================================
   Rendering the report log
   ============================================================ */

async function renderReports() {
  const reports = await loadReports();
  updateStats(reports);

  const filteredReports = reports.filter((report) =>
    matchesDistrict(report, activeDistrict)
  );

  reportsList.innerHTML = "";

  if (activeDistrict) {
    resultSummary.textContent = `${filteredReports.length} report${
      filteredReports.length === 1 ? "" : "s"
    } found for "${activeDistrict}".`;
  } else {
    resultSummary.textContent = `Showing all ${filteredReports.length} available reports.`;
  }

  if (filteredReports.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent =
      "No reports for this district yet. Be the first to log one below.";
    reportsList.appendChild(emptyState);
    return;
  }

  filteredReports.forEach((report, index) => {
    const card = document.createElement("article");
    card.className = "report-card";

    card.innerHTML = `
      <div class="report-topline">
        <div class="report-title">
          <h3>${escapeHtml(report.eventName)}</h3>
          <div class="report-meta">${escapeHtml(report.organisation)}</div>
          <div class="report-rating">${escapeHtml(ratingLabel(report))}</div>
        </div>
        ${createPostmark(report.district, index)}
      </div>
    `;

    const details = document.createElement("div");
    details.className = "detail-grid";

    const hotelBlock = createHotelDetailsBlock(report.hotelDetails);
    const hotelLocationLink = report.hotelMapsLink ? buildGoogleMapsUrl(report.hotelMapsLink) : null;
    const touristLocationLink = report.touristMapsLink ? buildGoogleMapsUrl(report.touristMapsLink) : null;

    const hotelLocationDetail = createDetail("Hotel location", report.hotelMapsLink);
    if (hotelLocationLink) {
      const link = document.createElement("a");
      link.className = "directions-btn";
      link.href = hotelLocationLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `Open hotel in Google Maps`;
      hotelLocationDetail.querySelector("span").replaceChildren(link);
    }

    const touristLocationDetail = createDetail("Tourist location", report.touristMapsLink);
    if (touristLocationLink) {
      const link = document.createElement("a");
      link.className = "directions-btn";
      link.href = touristLocationLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `Open tourist place in Google Maps`;
      touristLocationDetail.querySelector("span").replaceChildren(link);
    }

    details.append(
      createDetail("Hotel review", report.hotelReview),
      createDetail("Room amount", report.roomAmount),
      createDetail("Event days", report.eventDays),
      createDetail("Food spots", report.foodSpots),
      createDetail("Tourist places", report.touristPlaces),
      createDetail("Extra tips", report.extraFeatures),
      hotelLocationDetail,
      touristLocationDetail
    );

    if (hotelBlock) {
      details.appendChild(hotelBlock);
    }

    card.appendChild(details);

    const hotelPhotos = createPhotoGallery(report.hotelImages, "Hotel photos");
    if (hotelPhotos) card.appendChild(hotelPhotos);

    const touristPhotos = createPhotoGallery(report.touristImages, "Tourist photos");
    if (touristPhotos) card.appendChild(touristPhotos);

    if (report.location && typeof report.location.lat === "number") {
      const mapContainerId = `report-map-${index}-${report.eventName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;
      card.appendChild(
        createLocationBlock("Hotel / venue pin", report.location, mapContainerId, report.eventName)
      );
    } else {
      const missingNote = document.createElement("p");
      missingNote.className = "location-missing-note";
      missingNote.textContent = "No exact hotel or venue location pinned for this report yet.";
      card.appendChild(missingNote);
    }

    if (report.touristLocation && typeof report.touristLocation.lat === "number") {
      const touristMapId = `tourist-map-${index}-${report.eventName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;
      card.appendChild(
        createLocationBlock("Tourist place pin", report.touristLocation, touristMapId, report.touristPlaces)
      );
    }

    reportsList.appendChild(card);
  });
}

async function setActiveDistrict(district) {
  activeDistrict = cleanText(district);
  topDistrictSearch.value = activeDistrict;
  if (heroDistrictSearch) heroDistrictSearch.value = activeDistrict;

  districtRail.querySelectorAll("[data-district]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.district.toLowerCase() === activeDistrict.toLowerCase()
    );
  });

  await renderReports();
  document.querySelector("#reports").scrollIntoView({ behavior: "smooth" });
}

/* ============================================================
   Form submission
   ============================================================ */

function getReportFromForm() {
  return {
    eventName: cleanText(document.querySelector("#eventName").value),
    district: cleanText(document.querySelector("#eventDistrict").value),
    organisation: cleanText(document.querySelector("#eventOrganisation").value),
    hotelStay: document.querySelector("#hotelStay").value,
    hotelRating: document.querySelector("#hotelRating").value,
    eventDays: eventDaysInput?.value?.trim() || "",
    hotelReview: cleanText(document.querySelector("#hotelReview").value),
    foodSpots: cleanText(document.querySelector("#foodSpots").value),
    touristPlaces: cleanText(document.querySelector("#touristPlaces").value),
    extraFeatures: cleanText(document.querySelector("#extraFeatures").value),
    hotelImages: hotelImages.map((image) => ({ name: image.name, dataUrl: image.dataUrl })),
    touristImages: touristImages.map((image) => ({ name: image.name, dataUrl: image.dataUrl })),
    roomAmount: roomAmountInput?.value?.trim() || "",
    hotelDetails: selectedHotelDetails,
    hotelMapsLink: selectedHotelDetails?.googleMapsUrl || "",
    touristMapsLink: touristMapsLinkInput?.value?.trim() || "",
    location: pickedLocation
      ? {
          lat: pickedLocation.lat,
          lng: pickedLocation.lng,
          address: pickedLocation.address
        }
      : null,
    touristLocation: touristPickedLocation
      ? {
          lat: touristPickedLocation.lat,
          lng: touristPickedLocation.lng,
          address: touristPickedLocation.address
        }
      : null
  };
}

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const report = getReportFromForm();
  await saveReport(report);

  reportForm.reset();
  resetLocationPickerUI();
  await setActiveDistrict(report.district);
});

topSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void setActiveDistrict(topDistrictSearch.value);
});

if (heroSearchForm) {
  heroSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void setActiveDistrict(heroDistrictSearch.value);
  });
}

districtRail.addEventListener("click", (event) => {
  const button = event.target.closest("[data-district]");
  if (!button) return;
  void setActiveDistrict(button.dataset.district);
});

if (hotelImageInput) {
  hotelImageInput.addEventListener("change", () => {
    handleImageSelection(hotelImageInput, hotelImagePreview, hotelImages);
  });
}

if (touristImageInput) {
  touristImageInput.addEventListener("change", () => {
    handleImageSelection(touristImageInput, touristImagePreview, touristImages);
  });
}

if (touristMapsLinkInput) {
  touristMapsLinkInput.addEventListener("input", renderLocationPreview);
}

if (loadPlacesButton) {
  loadPlacesButton.addEventListener("click", handleHotelSearchInput);
}

initHotelSearchUI();

hotelLocationPicker = initLocationPicker({
  mapSelector: "#locationPickerMap",
  searchInputSelector: "#locationSearchInput",
  searchButtonSelector: "#locationSearchButton",
  suggestionsSelector: "#locationSuggestions",
  addressOutput: locationPickedAddress,
  emptyMessage: "No location pinned yet.",
  onPinChange: (location) => {
    pickedLocation = location;
  }
});

touristLocationPicker = initLocationPicker({
  mapSelector: "#touristLocationPickerMap",
  searchInputSelector: "#touristLocationSearchInput",
  searchButtonSelector: "#touristLocationSearchButton",
  suggestionsSelector: "#touristLocationSuggestions",
  addressOutput: touristLocationPickedAddress,
  emptyMessage: "No tourist place pinned yet.",
  onPinChange: (location) => {
    touristPickedLocation = location;
  }
});

renderImagePreview(hotelImagePreview, hotelImages);
renderImagePreview(touristImagePreview, touristImages);
renderSelectedHotelCard();
void renderReports();
setInterval(() => {
  void renderReports();
}, 5000);