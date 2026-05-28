/**
 * Гостиница «Олимп» — общая логика для страницы.
 * Формы с атрибутом data-stay-range: дата заезда не раньше сегодня (локальный календарь);
 * дата выезда не раньше следующего дня после заезда (как минимум одна ночь).
 */
(function () {
  const AUTH_TOKEN_KEY = "olympAuthToken";
  const AUTH_USER_KEY = "olympAuthUser";
  const AUTH_REMEMBER_KEY = "olympAuthRemember";
  const MAX_GUESTS = 2;

  const SAFE_REDIRECTS = new Set([
    "account.html",
    "account-bookings.html",
    "account-settings.html",
    "account-notifications.html",
    "account-payments.html",
    "booking.html",
    "rooms.html",
    "services.html",
    "reviews.html",
    "contacts.html",
    "about.html",
    "index.html",
    "forgot-password.html",
    "reset-password.html",
    "login.html",
    "admin.html",
  ]);

  function clampGuestCount(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return 1;
    return Math.min(MAX_GUESTS, n);
  }

  function isServiceGuestField(element) {
    return Boolean(element.closest("[data-service-booking-form]"));
  }

  function initGuestLimitInputs() {
    document.querySelectorAll('input[name="guests"][type="number"]').forEach(function (input) {
      if (isServiceGuestField(input)) return;

      input.min = "1";
      input.max = String(MAX_GUESTS);

      function syncGuestInput() {
        input.value = String(clampGuestCount(input.value));
      }

      input.addEventListener("input", syncGuestInput);
      input.addEventListener("change", syncGuestInput);
      syncGuestInput();
    });

    document.querySelectorAll('select[name="guests"]').forEach(function (select) {
      if (isServiceGuestField(select)) return;
      Array.from(select.options).forEach(function (option) {
        if (Number(option.value) > MAX_GUESTS) {
          option.remove();
        }
      });

      if (Number(select.value) > MAX_GUESTS) {
        select.value = String(MAX_GUESTS);
      }
    });
  }

  function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
  }

  function getAuthUser() {
    const raw = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function isAuthRemembered() {
    if (localStorage.getItem(AUTH_REMEMBER_KEY)) {
      return localStorage.getItem(AUTH_REMEMBER_KEY) === "1";
    }
    return Boolean(localStorage.getItem(AUTH_TOKEN_KEY));
  }

  function setAuthSession(token, user, remember) {
    const useLocalStorage = remember === true;

    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));

    if (useLocalStorage) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      localStorage.setItem(AUTH_REMEMBER_KEY, "1");
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_REMEMBER_KEY);
    }
  }

  function getSafeRedirectTarget(next, user) {
    const value = String(next || "").trim();
    if (!value) return "";

    if (/^[a-z0-9][a-z0-9\-_.]*\.html(?:#[\w\-]+)?$/i.test(value)) {
      const page = value.split("#")[0].toLowerCase();
      if (page === "admin.html" && user && user.role === "admin") {
        return value;
      }
      if (SAFE_REDIRECTS.has(page)) {
        return value;
      }
    }

    return "";
  }

  function clearAuthSession() {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_REMEMBER_KEY);
  }

  function redirectToLogin() {
    const page = window.location.pathname.split("/").pop() || "account.html";
    window.location.href = "login.html?next=" + encodeURIComponent(page);
  }

  function buildAuthHeaders(extraHeaders) {
    const headers = Object.assign({ "Content-Type": "application/json" }, extraHeaders || {});
    const token = getAuthToken();
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    return headers;
  }

  async function refreshAuthSession() {
    const token = getAuthToken();
    if (!token) return null;

    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: "Bearer " + token },
      });

      if (response.status === 401 || response.status === 403) {
        clearAuthSession();
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      setAuthSession(token, data.user, isAuthRemembered());
      return data.user;
    } catch (error) {
      return null;
    }
  }

  async function initAccountAuthGuard() {
    const needsAuth =
      document.querySelector(".account-profile") ||
      document.querySelector("[data-account-settings-root]");
    if (!needsAuth) return true;

    const token = getAuthToken();
    if (!token) {
      redirectToLogin();
      return false;
    }

    const user = await refreshAuthSession();
    if (!user) {
      redirectToLogin();
      return false;
    }

    return true;
  }

  function initSiteHeaderAuth() {
    const actions = document.querySelector(".site-header__actions");
    if (!actions) return;

    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (currentPage === "admin.html") {
      return;
    }

    const ghostBtn = actions.querySelector(".site-header__btn--ghost");
    if (!ghostBtn) return;

    const user = getAuthUser();
    const token = getAuthToken();

    if (!token || !user) {
      ghostBtn.textContent = "Вход";
      ghostBtn.href = "login.html";
      ghostBtn.removeAttribute("aria-current");
      return;
    }

    if (user.role === "admin") {
      ghostBtn.textContent = "Админ";
      ghostBtn.href = "admin.html";
    } else {
      ghostBtn.textContent = "Кабинет";
      ghostBtn.href = "account.html";
    }

    if (window.location.pathname.endsWith("account.html") && user.role !== "admin") {
      ghostBtn.setAttribute("aria-current", "page");
    } else {
      ghostBtn.removeAttribute("aria-current");
    }
  }

  function localISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDaysToISODate(iso, days) {
    const parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    const dt = new Date(y, m, d);
    if (Number.isNaN(dt.getTime())) return iso;
    dt.setDate(dt.getDate() + days);
    return localISODate(dt);
  }

  const MAX_BOOKING_YEARS_AHEAD = 2;

  function maxBookingDateISO() {
    const date = startOfToday();
    date.setFullYear(date.getFullYear() + MAX_BOOKING_YEARS_AHEAD);
    return localISODate(date);
  }

  function clampDateInputToRange(input) {
    if (!input || input.type !== "date") return;

    const maxStr = maxBookingDateISO();
    input.max = maxStr;

    if (input.value && input.value > maxStr) {
      input.value = maxStr;
    }

    if (input.min && input.value && input.value < input.min) {
      input.value = input.min;
    }
  }

  function bindStayRangeForm(form) {
    const checkin = form.querySelector('[data-stay-range="checkin"]');
    const checkout = form.querySelector('[data-stay-range="checkout"]');
    if (!checkin || !checkout) return;
    if (checkin.type !== "date" || checkout.type !== "date") return;

    function applyMinimums() {
      const todayStr = localISODate(startOfToday());
      const maxDateStr = maxBookingDateISO();

      checkin.min = todayStr;
      checkin.max = maxDateStr;
      if (checkin.value && checkin.value < todayStr) {
        checkin.value = todayStr;
      }
      if (checkin.value && checkin.value > maxDateStr) {
        checkin.value = maxDateStr;
      }

      let minCheckout = todayStr;
      if (checkin.value) {
        const nextAfterCheckin = addDaysToISODate(checkin.value, 1);
        minCheckout = nextAfterCheckin > todayStr ? nextAfterCheckin : todayStr;
      }
      checkout.min = minCheckout;
      checkout.max = maxDateStr;

      if (checkout.value && checkout.value < checkout.min) {
        checkout.value = checkout.min;
      }
      if (checkout.value && checkout.value > maxDateStr) {
        checkout.value = maxDateStr;
      }

      if (checkin.value && checkout.value && checkout.value <= checkin.value) {
        checkout.value = addDaysToISODate(checkin.value, 1);
      }

      if (checkout.value && checkout.value > maxDateStr) {
        checkout.value = maxDateStr;
      }
    }

    applyMinimums();

    checkin.addEventListener("change", applyMinimums);
    checkin.addEventListener("input", applyMinimums);

    function clampCheckoutToCheckin() {
      if (!checkin.value || !checkout.value) return;
      const minOk = addDaysToISODate(checkin.value, 1);
      if (checkout.value <= checkin.value || checkout.value < minOk) {
        checkout.value = minOk;
      }
    }

    checkout.addEventListener("change", clampCheckoutToCheckin);
    checkout.addEventListener("input", clampCheckoutToCheckin);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        applyMinimums();
      }
    });
  }

  function initStayRangeForms() {
    document.querySelectorAll("form[data-stay-range]").forEach(bindStayRangeForm);
  }

  function initAboutGallery() {
    const layout = document.querySelector(".about-gallery__layout");
    if (!layout) return;

    const main = layout.querySelector(".about-gallery__main");
    const thumbs = layout.querySelectorAll(".about-gallery__thumb");
    if (!main || !thumbs.length) return;

    const images = Array.from(thumbs).map(function (thumb, index) {
      const img = thumb.querySelector("img");
      return {
        src: img ? img.currentSrc || img.src : "",
        alt: img ? img.alt || `Фото ${index + 1}` : `Фото ${index + 1}`,
      };
    });

    let lightbox = document.querySelector("[data-about-gallery-lightbox]");
    let lightboxImage = null;
    let currentIndex = 0;
    let lastFocusedElement = null;

    function setActiveThumb(index) {
      thumbs.forEach(function (item, itemIndex) {
        const isActive = itemIndex === index;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function updateMainImage(index) {
      const image = images[index];
      if (!image || !image.src) return;

      main.classList.add("is-changing");

      window.setTimeout(function () {
        main.src = image.src;
        main.alt = image.alt;
        main.classList.remove("is-changing");
      }, 120);
    }

    function ensureLightbox() {
      if (lightbox) return;

      lightbox = document.createElement("div");
      lightbox.className = "about-gallery-lightbox";
      lightbox.setAttribute("data-about-gallery-lightbox", "");
      lightbox.hidden = true;
      lightbox.innerHTML =
        '<div class="about-gallery-lightbox__backdrop" data-about-gallery-lightbox-close tabindex="-1" aria-hidden="true"></div>' +
        '<div class="about-gallery-lightbox__stage" role="dialog" aria-modal="true" aria-label="Просмотр фотографии">' +
        '<button class="about-gallery-lightbox__close" type="button" data-about-gallery-lightbox-close aria-label="Закрыть">×</button>' +
        '<button class="about-gallery-lightbox__hit about-gallery-lightbox__hit--prev" type="button" data-about-gallery-lightbox-prev aria-label="Предыдущее фото"></button>' +
        '<img class="about-gallery-lightbox__image" alt="" decoding="async" />' +
        '<button class="about-gallery-lightbox__hit about-gallery-lightbox__hit--next" type="button" data-about-gallery-lightbox-next aria-label="Следующее фото"></button>' +
        "</div>";

      document.body.appendChild(lightbox);

      lightboxImage = lightbox.querySelector(".about-gallery-lightbox__image");

      lightbox.querySelectorAll("[data-about-gallery-lightbox-close]").forEach(function (trigger) {
        trigger.addEventListener("click", closeLightbox);
      });

      const prevBtn = lightbox.querySelector("[data-about-gallery-lightbox-prev]");
      const nextBtn = lightbox.querySelector("[data-about-gallery-lightbox-next]");

      if (prevBtn) {
        prevBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          showLightboxImage(currentIndex - 1);
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          showLightboxImage(currentIndex + 1);
        });
      }

      if (lightboxImage) {
        lightboxImage.addEventListener("click", function (event) {
          event.stopPropagation();
        });
      }

      lightbox.addEventListener("keydown", function (event) {
        if (lightbox.hidden) return;

        if (event.key === "Escape") {
          closeLightbox();
        }

        if (event.key === "ArrowLeft") {
          showLightboxImage(currentIndex - 1);
        }

        if (event.key === "ArrowRight") {
          showLightboxImage(currentIndex + 1);
        }
      });
    }

    function showLightboxImage(index) {
      if (!images.length) return;

      currentIndex = (index + images.length) % images.length;
      const image = images[currentIndex];

      setActiveThumb(currentIndex);
      updateMainImage(currentIndex);

      if (lightboxImage) {
        lightboxImage.src = image.src;
        lightboxImage.alt = image.alt;
      }
    }

    function openLightbox(index) {
      ensureLightbox();
      if (!lightbox) return;

      showLightboxImage(index);
      lastFocusedElement = document.activeElement;
      lightbox.hidden = false;
      document.body.classList.add("about-gallery-lightbox-open");

      const closeBtn = lightbox.querySelector(".about-gallery-lightbox__close");
      if (closeBtn) closeBtn.focus();
    }

    function closeLightbox() {
      if (!lightbox || lightbox.hidden) return;

      lightbox.hidden = true;
      document.body.classList.remove("about-gallery-lightbox-open");

      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    }

    thumbs.forEach(function (thumb, index) {
      thumb.addEventListener("click", function () {
        openLightbox(index);
      });
    });

    main.style.cursor = "pointer";
    main.setAttribute("role", "button");
    main.setAttribute("tabindex", "0");
    main.setAttribute("aria-label", "Открыть фото в полном размере");

    main.addEventListener("click", function () {
      openLightbox(currentIndex);
    });

    main.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(currentIndex);
      }
    });
  }

  function initRoomDetailGallery() {
    const gallery = document.querySelector("[data-room-gallery]");
    if (!gallery) return;

    const main = gallery.querySelector(".room-detail__main");
    const thumbs = gallery.querySelectorAll(".room-detail__thumb");
    if (!main || !thumbs.length) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener("click", function () {
        const thumbImg = thumb.querySelector("img");
        if (!thumbImg || thumb.classList.contains("is-active")) return;

        main.classList.add("is-changing");

        window.setTimeout(function () {
          const mainSrc = main.getAttribute("src") || "";
          const thumbSrc = thumbImg.getAttribute("src") || "";

          main.setAttribute("src", thumbSrc);
          thumbImg.setAttribute("src", mainSrc);

          main.classList.remove("is-changing");
        }, 120);

        thumbs.forEach(function (item) {
          item.classList.remove("is-active");
          item.setAttribute("aria-pressed", "false");
        });

        thumb.classList.add("is-active");
        thumb.setAttribute("aria-pressed", "true");
      });
    });
  }

  function initReviewsFormStars() {
    const group = document.querySelector("[data-reviews-stars]");
    if (!group) return;

    const buttons = group.querySelectorAll(".reviews-form__star-btn[data-rating]");
    if (!buttons.length) return;

    const filledSrc = group.dataset.starFilled || "assets/images/rooms/main-star.svg";
    const emptySrc = group.dataset.starEmpty || "assets/images/review-star-grey.svg";
    const form = group.closest(".reviews-form__card")?.querySelector(".reviews-form__form");
    const ratingInput = form?.querySelector('input[name="rating"]');

    let selectedRating = 0;
    let hoverRating = 0;

    function pulseStar(button) {
      button.classList.remove("is-pop");
      void button.offsetWidth;
      button.classList.add("is-pop");

      window.setTimeout(function () {
        button.classList.remove("is-pop");
      }, 420);
    }

    function renderStars(activeRating, options) {
      const animateFill = Boolean(options && options.animateFill);

      buttons.forEach(function (button) {
        const value = Number(button.dataset.rating);
        const img = button.querySelector(".reviews-form__star");
        const wasActive = button.classList.contains("is-active");
        const isActive = value <= activeRating;

        if (img) {
          if (isActive && !wasActive && animateFill) {
            img.classList.remove("is-filling");
            void img.offsetWidth;
            img.classList.add("is-filling");
          }

          img.src = isActive ? filledSrc : emptySrc;
        }

        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function setRating(value) {
      selectedRating = value;
      hoverRating = 0;

      if (ratingInput) {
        ratingInput.value = String(value);
      }

      renderStars(value, { animateFill: true });
    }

    buttons.forEach(function (button) {
      const value = Number(button.dataset.rating);

      button.addEventListener("click", function () {
        pulseStar(button);
        setRating(value);
      });

      button.addEventListener("mouseenter", function () {
        hoverRating = value;
        renderStars(value);
      });

      button.addEventListener("focus", function () {
        hoverRating = value;
        renderStars(value);
      });
    });

    group.addEventListener("mouseleave", function () {
      hoverRating = 0;
      renderStars(selectedRating);
    });

    group.addEventListener("focusout", function (event) {
      if (!group.contains(event.relatedTarget)) {
        hoverRating = 0;
        renderStars(selectedRating);
      }
    });

    renderStars(0);
  }

  function initReviewsFormSubmit() {
    const form = document.querySelector(".reviews-form__form");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const ratingInput = form.querySelector('[name="rating"]');
      const nameInput = form.querySelector('[name="name"]');
      const messageInput = form.querySelector('[name="message"]');
      const rating = ratingInput ? Number(ratingInput.value) : 0;
      const authorName = nameInput ? nameInput.value.trim() : "";
      const message = messageInput ? messageInput.value.trim() : "";

      if (!rating || !authorName || !message) {
        window.alert("Заполните оценку, имя и текст отзыва.");
        return;
      }

      try {
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorName, message, rating }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Не удалось отправить отзыв.");
        }

        form.reset();
        if (ratingInput) ratingInput.value = "";
        window.alert(data.message || "Отзыв отправлен на модерацию.");
        await initReviewsFromApi();
        initReviewsReveal();
      } catch (error) {
        window.alert(error.message || "Не удалось отправить отзыв.");
      }
    });
  }

  function formatReviewDate(iso) {
    const date = parseAccountISODate(String(iso || "").slice(0, 10));
    if (!date) return "—";
    return date.getDate() + " " + RU_MONTHS[date.getMonth()] + " " + date.getFullYear();
  }

  function getReviewInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    const compact = String(name || "").trim();
    return (compact.slice(0, 2) || "Г").toUpperCase();
  }

  function renderReviewStarsMarkup(rating) {
    const value = Math.max(0, Math.min(5, Number(rating) || 0));
    let markup = "";
    for (let star = 1; star <= 5; star += 1) {
      const src =
        star <= value
          ? "assets/images/rooms/main-star.svg"
          : "assets/images/review-star-grey.svg";
      markup +=
        '<img class="reviews-list__star" src="' +
        src +
        '" alt="" width="25" height="24" decoding="async" />';
    }
    return markup;
  }

  function renderReviewsSummary(reviews) {
    const summaryCard = document.querySelector("[data-reviews-summary]");
    if (!summaryCard) return;

    const items = Array.isArray(reviews) ? reviews : [];
    const total = items.length;
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    let recommend = 0;

    items.forEach(function (review) {
      const rating = Math.round(Number(review.rating) || 0);
      if (rating >= 1 && rating <= 5) {
        counts[rating] += 1;
        sum += rating;
        if (rating >= 4) recommend += 1;
      }
    });

    const average = total ? sum / total : 0;
    const scoreEl = summaryCard.querySelector(".reviews-summary__score");
    const totalEl = summaryCard.querySelector("[data-reviews-total-count]");
    const recommendEl = summaryCard.querySelector("[data-reviews-recommend]");
    const barRows = summaryCard.querySelectorAll(".reviews-summary__bar-row");

    if (scoreEl) {
      scoreEl.textContent = total ? average.toFixed(1) : "—";
    }

    if (totalEl) {
      totalEl.textContent = String(total);
    }

    if (recommendEl) {
      recommendEl.textContent = total ? Math.round((recommend / total) * 100) + "%" : "—";
    }

    barRows.forEach(function (row) {
      const labelEl = row.querySelector(".reviews-summary__bar-label");
      const fillEl = row.querySelector(".reviews-summary__bar-fill");
      const countEl = row.querySelector(".reviews-summary__bar-count");
      const starValue = labelEl ? Number(labelEl.textContent) : 0;
      const count = counts[starValue] || 0;
      const width = total ? (count / total) * 100 : 0;

      if (fillEl) {
        fillEl.style.width = width.toFixed(2) + "%";
      }

      if (countEl) {
        countEl.textContent = String(count);
      }
    });
  }

  function renderReviewsList(listEl, reviews) {
    const items = Array.isArray(reviews) ? reviews : [];

    if (!items.length) {
      listEl.innerHTML =
        '<p class="reviews-list__empty">Пока нет опубликованных отзывов. Будьте первым!</p>';
      return;
    }

    listEl.innerHTML = items
      .map(function (review) {
        const rating = Number(review.rating) || 0;
        const createdAt = review.createdAt || "";
        const roomType = review.roomType ? String(review.roomType) : "Гостиница «Олимп»";

        return (
          '<article class="reviews-list__card">' +
          '<div class="reviews-list__head">' +
          '<div class="reviews-list__stars" aria-label="Оценка ' +
          rating +
          ' из 5">' +
          renderReviewStarsMarkup(rating) +
          "</div>" +
          '<span class="reviews-list__score">' +
          rating.toFixed(1) +
          "</span>" +
          "</div>" +
          '<p class="reviews-list__text">' +
          escapeHtml(review.message) +
          "</p>" +
          '<div class="reviews-list__divider" aria-hidden="true">' +
          '<img class="reviews-list__stick" src="assets/images/review-stick-info.svg" alt="" width="1340" height="1" decoding="async" />' +
          "</div>" +
          '<footer class="reviews-list__footer">' +
          '<div class="reviews-list__author-block">' +
          '<span class="reviews-list__avatar" aria-hidden="true">' +
          escapeHtml(getReviewInitials(review.authorName)) +
          "</span>" +
          '<div class="reviews-list__meta">' +
          '<p class="reviews-list__author">' +
          escapeHtml(review.authorName) +
          "</p>" +
          '<p class="reviews-list__room">' +
          escapeHtml(roomType) +
          "</p>" +
          "</div>" +
          "</div>" +
          '<time class="reviews-list__date" datetime="' +
          escapeHtml(String(createdAt).slice(0, 10)) +
          '">' +
          escapeHtml(formatReviewDate(createdAt)) +
          "</time>" +
          "</footer>" +
          "</article>"
        );
      })
      .join("");
  }

  async function initReviewsFromApi() {
    const listEl = document.querySelector("[data-reviews-list]");
    if (!listEl) return;

    try {
      const response = await fetch("/api/reviews");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить отзывы.");
      }

      const reviews = data.reviews || [];
      renderReviewsSummary(reviews);
      renderReviewsList(listEl, reviews);
    } catch (error) {
      listEl.innerHTML =
        '<p class="reviews-list__empty">' +
        escapeHtml(error.message || "Не удалось загрузить отзывы.") +
        "</p>";
    }
  }

  function initBookingReveal() {
    const targets = document.querySelectorAll(".booking-rooms__card");
    if (!targets.length) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      targets.forEach(function (target) {
        target.classList.add("is-revealed");
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries, io) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          io.unobserve(entry.target);
        });
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    targets.forEach(function (target) {
      observer.observe(target);
    });
  }

  const BOOKING_FILTER_LABELS = {
    all: "Все номера",
    "single-standard": "Одноместный стандарт",
    "improved-single": "Улучшенный одноместный стандарт",
    "improved-double": "Улучшенный двухместный стандарт",
    "lux-single": "Одноместный люкс",
  };

  const ROOM_FILTER_META = {
    "single-standard": {
      price: 2400,
      maxGuests: 1,
      prices: { basic: 2400, "half-board": 2850, "full-board": 3300 },
    },
    "improved-single": {
      price: 3400,
      maxGuests: 1,
      prices: { basic: 3400, "half-board": 3850, "full-board": 4300 },
    },
    "improved-double": {
      price: 3600,
      maxGuests: 2,
      prices: { basic: 3600, "half-board": 4500, "full-board": 5400 },
    },
    "lux-single": {
      price: 5000,
      maxGuests: 1,
      prices: { basic: 5000, "half-board": 5450, "full-board": 5900 },
    },
  };

  const ROOM_TARIFF_OPTIONS = [
    { value: "basic", label: "За место (основной тариф)", optionPrefix: "За место" },
    { value: "half-board", label: "Номер + 2-х разовое питание", optionPrefix: "Номер + 2-х разовое питание" },
    { value: "full-board", label: "Номер + 3-х разовое питание", optionPrefix: "Номер + 3-х разовое питание" },
  ];

  function syncCardTariffDataset(card, prices, fallbackPrice) {
    if (!card || !prices) return;
    card.dataset.tariffBasic = String(prices.basic != null ? prices.basic : fallbackPrice);
    card.dataset.tariffHalfBoard = String(prices["half-board"] != null ? prices["half-board"] : fallbackPrice);
    card.dataset.tariffFullBoard = String(prices["full-board"] != null ? prices["full-board"] : fallbackPrice);
  }

  function getCardTariffPrices(card, slug) {
    const fallbackMeta = ROOM_FILTER_META[slug] || { price: 0, prices: { basic: 0, "half-board": 0, "full-board": 0 } };
    const fallback = fallbackMeta.prices || {
      basic: fallbackMeta.price,
      "half-board": fallbackMeta.price,
      "full-board": fallbackMeta.price,
    };

    if (!card) return fallback;

    const basic = Number(card.dataset.tariffBasic);
    const halfBoard = Number(card.dataset.tariffHalfBoard);
    const fullBoard = Number(card.dataset.tariffFullBoard);

    if (!Number.isFinite(basic)) return fallback;

    return {
      basic: basic,
      "half-board": Number.isFinite(halfBoard) ? halfBoard : fallback["half-board"],
      "full-board": Number.isFinite(fullBoard) ? fullBoard : fallback["full-board"],
    };
  }

  function getRoomTariffOptionLabel(value) {
    const option = ROOM_TARIFF_OPTIONS.find(function (item) {
      return item.value === value;
    });
    return option ? option.label : value;
  }

  function parsePriceRange(value) {
    const text = String(value || "").trim();
    if (!text) {
      return { min: null, max: null };
    }

    const nums = text.match(/\d+/g);
    if (!nums || !nums.length) {
      return { min: null, max: null };
    }

    if (nums.length === 1) {
      return { min: Number(nums[0]), max: null };
    }

    const min = Number(nums[0]);
    const max = Number(nums[1]);
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
  }

  function getRoomMeta(slug, apiRoom) {
    const fallback = ROOM_FILTER_META[slug] || { price: 0, maxGuests: 1 };

    if (!apiRoom) {
      return {
        price: fallback.price,
        maxGuests: fallback.maxGuests,
        prices: fallback.prices,
      };
    }

    const price =
      apiRoom.pricePerNight ||
      (apiRoom.prices && apiRoom.prices.basic) ||
      fallback.price;

    return {
      price: Number(price) || fallback.price,
      maxGuests: Number(apiRoom.maxGuests) || fallback.maxGuests,
      prices: apiRoom.prices || fallback.prices,
    };
  }

  function initBookingAvailability() {
    const page = document.querySelector("[data-booking-page]");
    if (!page) return;

    const filterForm = page.querySelector(".booking-filters__form");
    const roomsList = page.querySelector("[data-booking-rooms-list]");
    const cards = page.querySelectorAll("[data-room-slug]");
    const filterLabels = page.querySelectorAll("[data-booking-filter-label]");
    let emptyEl = page.querySelector("[data-booking-empty]");

    if (!emptyEl && roomsList) {
      emptyEl = document.createElement("p");
      emptyEl.className = "booking-rooms__empty";
      emptyEl.setAttribute("data-booking-empty", "");
      emptyEl.hidden = true;
      emptyEl.textContent = "По выбранным фильтрам номера не найдены. Измените параметры поиска.";
      roomsList.appendChild(emptyEl);
    }

    cards.forEach(function (card) {
      const slug = card.getAttribute("data-room-slug");
      const meta = ROOM_FILTER_META[slug];
      if (!meta) return;
      card.dataset.roomPrice = String(meta.price);
      card.dataset.roomMaxGuests = String(meta.maxGuests);
      syncCardTariffDataset(card, meta.prices, meta.price);
    });

    function getFilterDates() {
      if (!filterForm) {
        return { checkIn: "", checkOut: "", guests: 1 };
      }

      const checkInEl = filterForm.querySelector('[name="check-in"]');
      const checkOutEl = filterForm.querySelector('[name="check-out"]');
      const guestsEl = filterForm.querySelector('[name="guests"]');

      return {
        checkIn: checkInEl ? checkInEl.value : "",
        checkOut: checkOutEl ? checkOutEl.value : "",
        guests: guestsEl ? clampGuestCount(guestsEl.value) : 1,
      };
    }

    function getFilterState() {
      const roomTypeEl = filterForm
        ? filterForm.querySelector('[name="room-type"]:checked')
        : null;
      const priceEl = filterForm ? filterForm.querySelector('[name="price-range"]') : null;
      const dates = getFilterDates();

      return {
        roomType: roomTypeEl ? roomTypeEl.value : "all",
        price: parsePriceRange(priceEl ? priceEl.value : ""),
        guests: dates.guests,
      };
    }

    function getCardMeta(card) {
      const slug = card.getAttribute("data-room-slug");
      const price = Number(card.dataset.roomPrice);
      const maxGuests = Number(card.dataset.roomMaxGuests);

      if (Number.isFinite(price) && Number.isFinite(maxGuests)) {
        return { price: price, maxGuests: maxGuests };
      }

      return ROOM_FILTER_META[slug] || { price: 0, maxGuests: 1 };
    }

    function applyFilters() {
      const filters = getFilterState();
      let visibleCount = 0;

      cards.forEach(function (card) {
        const slug = card.getAttribute("data-room-slug");
        const meta = getCardMeta(card);
        let visible = true;

        if (filters.roomType !== "all" && slug !== filters.roomType) {
          visible = false;
        }

        if (filters.guests > meta.maxGuests) {
          visible = false;
        }

        if (filters.price.min != null && meta.price < filters.price.min) {
          visible = false;
        }

        if (filters.price.max != null && meta.price > filters.price.max) {
          visible = false;
        }

        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      if (emptyEl) {
        emptyEl.hidden = visibleCount > 0;
      }
    }

    function applyUrlParams() {
      const params = new URLSearchParams(window.location.search);
      const checkIn = params.get("checkin") || params.get("check-in") || "";
      const checkOut = params.get("checkout") || params.get("check-out") || "";
      const guests = params.get("guests") || "";
      const roomType = params.get("room-type") || params.get("roomType") || "";

      if (!filterForm) return;

      const checkInEl = filterForm.querySelector('[name="check-in"]');
      const checkOutEl = filterForm.querySelector('[name="check-out"]');
      const guestsEl = filterForm.querySelector('[name="guests"]');

      if (checkInEl && checkIn) checkInEl.value = checkIn;
      if (checkOutEl && checkOut) checkOutEl.value = checkOut;
      if (guestsEl && guests) guestsEl.value = String(clampGuestCount(guests));

      if (roomType && roomType !== "all") {
        const roomTypeEl = filterForm.querySelector('[name="room-type"][value="' + roomType + '"]');
        if (roomTypeEl) roomTypeEl.checked = true;
      }
    }

    async function refreshAvailability() {
      const dates = getFilterDates();
      let url = "/api/rooms";

      if (dates.checkIn && dates.checkOut) {
        url +=
          "?checkIn=" +
          encodeURIComponent(dates.checkIn) +
          "&checkOut=" +
          encodeURIComponent(dates.checkOut);
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("rooms request failed");
        }

        const data = await response.json();
        const rooms = data.rooms || [];
        const bySlug = {};
        let totalAvailable = 0;

        rooms.forEach(function (room) {
          bySlug[room.slug] = room;
          totalAvailable += room.availableCount != null ? room.availableCount : room.totalUnits || 0;
        });

        cards.forEach(function (card) {
          const slug = card.getAttribute("data-room-slug");
          const room = bySlug[slug];
          const meta = getRoomMeta(slug, room);

          card.dataset.roomPrice = String(meta.price);
          card.dataset.roomMaxGuests = String(meta.maxGuests);
          if (meta.prices) {
            syncCardTariffDataset(card, meta.prices, meta.price);
          }

          if (!room) return;

          const count =
            room.availableCount != null ? room.availableCount : room.totalUnits || 0;
          const countEl = card.querySelector("[data-booking-availability]");
          const unavailableEl = card.querySelector("[data-booking-unavailable]");
          const bookBtn = card.querySelector('[data-booking-action="book"]');

          if (countEl) {
            countEl.textContent = String(count);
            countEl.setAttribute("aria-label", "Доступно номеров: " + count);
          }

          const isUnavailable = count <= 0;
          card.classList.toggle("booking-rooms__card--unavailable", isUnavailable);

          if (unavailableEl) {
            unavailableEl.hidden = !isUnavailable;
          }

          if (bookBtn) {
            bookBtn.setAttribute("aria-disabled", isUnavailable ? "true" : "false");
            bookBtn.textContent = isUnavailable ? "Недоступно" : "Забронировать";
          }
        });

        filterLabels.forEach(function (labelEl) {
          const key = labelEl.getAttribute("data-booking-filter-label");

          if (key === "all") {
            labelEl.textContent = BOOKING_FILTER_LABELS.all + ": " + totalAvailable;
            return;
          }

          const room = bySlug[key];
          const count = room
            ? room.availableCount != null
              ? room.availableCount
              : room.totalUnits || 0
            : 0;
          const prefix = BOOKING_FILTER_LABELS[key] || key;
          labelEl.textContent = prefix + ": " + count;
        });
      } catch (error) {
        /* работаем со статическими данными, если API недоступен */
      }

      applyFilters();
    }

    async function submitBooking(slug, card) {
      const dates = getFilterDates();

      if (typeof openBookingPaymentModal === "function") {
        openBookingPaymentModal(slug, card, dates);
        return;
      }

      if (!dates.checkIn || !dates.checkOut) {
        window.alert("Выберите даты заезда и выезда в фильтрах слева.");
        return;
      }

      if (dates.guests < 1 || dates.guests > MAX_GUESTS) {
        window.alert("Количество гостей должно быть от 1 до " + MAX_GUESTS + ".");
        return;
      }

      window.alert("Окно оплаты недоступно. Обновите страницу.");
    }

    refreshBookingAvailability = refreshAvailability;

    applyUrlParams();

    page.addEventListener("click", function (event) {
      const bookBtn = event.target.closest('[data-booking-action="book"]');
      if (!bookBtn) return;

      event.preventDefault();

      const card = bookBtn.closest("[data-room-slug]");
      if (!card || card.classList.contains("booking-rooms__card--unavailable")) return;

      submitBooking(card.getAttribute("data-room-slug"), card);
    });

    if (filterForm) {
      filterForm.addEventListener("submit", function (event) {
        event.preventDefault();
        refreshAvailability();
      });

      filterForm.addEventListener("reset", function () {
        window.setTimeout(function () {
          refreshAvailability();
        }, 0);
      });

      const checkInEl = filterForm.querySelector('[name="check-in"]');
      const checkOutEl = filterForm.querySelector('[name="check-out"]');
      const guestsEl = filterForm.querySelector('[name="guests"]');
      const priceEl = filterForm.querySelector('[name="price-range"]');
      const roomTypeInputs = filterForm.querySelectorAll('[name="room-type"]');

      if (checkInEl) checkInEl.addEventListener("change", refreshAvailability);
      if (checkOutEl) checkOutEl.addEventListener("change", refreshAvailability);
      if (guestsEl) guestsEl.addEventListener("change", applyFilters);
      if (priceEl) priceEl.addEventListener("change", applyFilters);

      roomTypeInputs.forEach(function (input) {
        input.addEventListener("change", applyFilters);
      });
    }

    refreshAvailability();
  }

  function initReviewsReveal() {
    const targets = document.querySelectorAll(
      ".reviews-list__card, .reviews-form__card, .reviews-booking .booking-cta__card"
    );
    if (!targets.length) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      targets.forEach(function (target) {
        target.classList.add("is-revealed");
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries, io) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          io.unobserve(entry.target);
        });
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    targets.forEach(function (target) {
      observer.observe(target);
    });
  }

  function initAccountBookingsTabs() {
    const root = document.querySelector("[data-account-bookings]");
    if (!root) return;

    const tabs = root.querySelectorAll(".account-bookings__tab");
    const panels = root.querySelectorAll(".account-bookings__panel");

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const target = tab.getAttribute("data-tab");
        if (!target) return;

        tabs.forEach(function (item) {
          const isActive = item === tab;
          item.classList.toggle("account-bookings__tab--active", isActive);
          item.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        panels.forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-panel") !== target;
        });
      });
    });
  }

  const RU_MONTHS = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];

  function parseAccountISODate(iso) {
    const parts = String(iso || "").split("-");
    if (parts.length !== 3) return null;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatAccountDateRange(checkIn, checkOut) {
    const start = parseAccountISODate(checkIn);
    const end = parseAccountISODate(checkOut);
    if (!start || !end) return "—";
    return (
      start.getDate() +
      " " +
      RU_MONTHS[start.getMonth()] +
      " - " +
      end.getDate() +
      " " +
      RU_MONTHS[end.getMonth()] +
      " " +
      end.getFullYear()
    );
  }

  function formatAccountDateShort(iso) {
    const date = parseAccountISODate(iso);
    if (!date) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return day + "." + month + "." + date.getFullYear();
  }

  function formatGuestsLabel(count) {
    const n = Number(count) || 1;
    if (n === 1) return "1 гость";
    if (n >= 2 && n <= 4) return n + " гостя";
    return n + " гостей";
  }

  function formatRublesAmount(amount) {
    return String(Number(amount) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " руб.";
  }

  function classifyRoomBooking(booking) {
    if (booking.status === "cancelled") return "cancelled";
    const checkOut = parseAccountISODate(booking.checkOut);
    if (checkOut && checkOut < startOfToday()) return "completed";
    return "active";
  }

  function getRoomBookingStatusMeta(booking) {
    const kind = classifyRoomBooking(booking);
    if (kind === "cancelled") {
      return { text: "Отменено", className: "account-recent__status--cancelled" };
    }
    if (kind === "completed") {
      return { text: "Завершено", className: "account-recent__status--completed" };
    }
    return { text: "Подтверждено", className: "account-recent__status--confirmed" };
  }

  function renderAccountEmptyState(title, text) {
    return (
      '<div class="account-bookings__empty">' +
      '<p class="account-bookings__empty-title">' +
      title +
      "</p>" +
      '<p class="account-bookings__empty-text">' +
      text +
      "</p>" +
      "</div>"
    );
  }

  function renderRoomBookingItem(booking, itemClass) {
    const status = getRoomBookingStatusMeta(booking);
    const statusSpanClass =
      itemClass === "account-bookings__item" ? "account-bookings__status" : status.className;

    return (
      '<li class="' +
      itemClass +
      '">' +
      '<span class="' +
      itemClass +
      '__icon" aria-hidden="true">' +
      '<img src="assets/images/advantages-icon-bed.svg" alt="" width="22" height="22" decoding="async" />' +
      "</span>" +
      '<div class="' +
      itemClass +
      '__info">' +
      '<p class="' +
      itemClass +
      '__room">' +
      escapeHtml(booking.roomName) +
      "</p>" +
      '<p class="' +
      itemClass +
      '__dates">' +
      escapeHtml(formatAccountDateRange(booking.checkIn, booking.checkOut)) +
      "</p>" +
      '<ul class="' +
      itemClass +
      '__tags">' +
      "<li>" +
      booking.nights +
      " " +
      (booking.nights === 1 ? "ночь" : booking.nights < 5 ? "ночи" : "ночей") +
      "</li>" +
      "<li>" +
      formatGuestsLabel(booking.guests) +
      "</li>" +
      "</ul>" +
      "</div>" +
      '<div class="' +
      itemClass +
      '__aside">' +
      '<span class="' +
      statusSpanClass +
      '">' +
      status.text +
      "</span>" +
      '<span class="' +
      itemClass +
      '__price">' +
      formatRublesAmount(booking.totalPrice) +
      "</span>" +
      "</div>" +
      "</li>"
    );
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function fetchAccountSummary() {
    const token = getAuthToken();
    if (!token) return { roomBookings: [], serviceBookings: [] };

    const response = await fetch("/api/account/summary", {
      headers: { Authorization: "Bearer " + token },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthSession();
        redirectToLogin();
      }
      return { roomBookings: [], serviceBookings: [] };
    }

    const data = await response.json();
    return {
      roomBookings: Array.isArray(data.roomBookings) ? data.roomBookings : [],
      serviceBookings: Array.isArray(data.serviceBookings) ? data.serviceBookings : [],
    };
  }

  function getCompletedRoomBookingsCount(summary) {
    return (summary.roomBookings || []).filter(function (booking) {
      return classifyRoomBooking(booking) === "completed";
    }).length;
  }

  function shouldShowLoyalGuestBadge(summary) {
    return getCompletedRoomBookingsCount(summary) >= 2;
  }

  function setAccountLoyalGuestBadge(summary) {
    const showBadge = shouldShowLoyalGuestBadge(summary);

    document.querySelectorAll(".account-profile").forEach(function (profile) {
      profile.dataset.accountLoyalGuest = showBadge ? "1" : "0";
      const badgeEl = profile.querySelector(".account-profile__badge");
      if (badgeEl) {
        badgeEl.hidden = !showBadge;
      }
    });
  }

  function renderAccountOverviewPage(summary) {
    const upcoming = document.querySelector("[data-account-upcoming]");
    const recentList = document.querySelector("[data-account-recent-list]");
    const overviewValues = document.querySelectorAll("[data-account-overview-value]");

    const roomBookings = summary.roomBookings || [];
    const activeBookings = roomBookings.filter(function (booking) {
      return classifyRoomBooking(booking) === "active";
    });
    const paymentsCount = roomBookings.length + (summary.serviceBookings || []).length;

    if (upcoming) {
      const titleEl = upcoming.querySelector("[data-account-upcoming-title]");
      const datesEl = upcoming.querySelector("[data-account-upcoming-dates]");
      const counterEl = upcoming.querySelector("[data-account-upcoming-counter]");
      const nextBooking = activeBookings.length
        ? activeBookings.slice().sort(function (a, b) {
            return parseAccountISODate(a.checkIn) - parseAccountISODate(b.checkIn);
          })[0]
        : null;

      if (titleEl) {
        titleEl.textContent = nextBooking
          ? nextBooking.roomName
          : "Нет предстоящих заездов";
      }

      if (datesEl) {
        datesEl.textContent = nextBooking
          ? formatAccountDateRange(nextBooking.checkIn, nextBooking.checkOut) +
            " - " +
            nextBooking.nights +
            " " +
            (nextBooking.nights === 1 ? "ночь" : nextBooking.nights < 5 ? "ночи" : "ночей")
          : "Забронируйте номер, чтобы увидеть информацию здесь";
      }

      if (counterEl) {
        counterEl.textContent = nextBooking ? String(nextBooking.nights) : "0";
      }
    }

    if (overviewValues.length >= 3) {
      overviewValues[0].textContent = String(activeBookings.length);
      overviewValues[1].textContent = String(paymentsCount);
      overviewValues[2].textContent = "0";
      const captions = document.querySelectorAll("[data-account-overview-caption]");
      if (captions[0]) {
        captions[0].textContent =
          activeBookings.length && activeBookings[0]
            ? "Заезд " + formatAccountDateShort(activeBookings[0].checkIn)
            : "Заезд —";
      }
    }

    if (recentList) {
      if (!roomBookings.length) {
        recentList.innerHTML =
          '<li class="account-recent__empty">' +
          renderAccountEmptyState(
            "Бронирований пока нет",
            "После оформления бронирования оно появится в этом разделе"
          ) +
          "</li>";
      } else {
        recentList.innerHTML = roomBookings
          .slice(0, 3)
          .map(function (booking) {
            return renderRoomBookingItem(booking, "account-recent__item");
          })
          .join("");
      }
    }
  }

  function renderAccountBookingsPage(summary) {
    const root = document.querySelector("[data-account-bookings]");
    if (!root) return;

    const roomBookings = summary.roomBookings || [];

    const groups = {
      active: [],
      completed: [],
      cancelled: [],
    };

    roomBookings.forEach(function (booking) {
      groups[classifyRoomBooking(booking)].push(booking);
    });

    root.querySelectorAll(".account-bookings__panel").forEach(function (panel) {
      const key = panel.getAttribute("data-panel");
      const items = groups[key] || [];

      if (!items.length) {
        const emptyCopy = {
          active: ["Активных бронирований нет", "Оформите новое бронирование на сайте"],
          completed: ["Завершённых бронирований нет", "Здесь появятся прошлые заезды"],
          cancelled: ["Отменённых бронирований нет", "У вас пока не было отменённых бронирований"],
        };
        const copy = emptyCopy[key] || emptyCopy.active;
        panel.innerHTML = renderAccountEmptyState(copy[0], copy[1]);
        return;
      }

      panel.innerHTML =
        '<ul class="account-bookings__list">' +
        items
          .map(function (booking) {
            return renderRoomBookingItem(booking, "account-bookings__item");
          })
          .join("") +
        "</ul>";
    });
  }

  function renderAccountNotificationsPage(summary) {
    const list = document.querySelector("[data-account-notifications-list]");
    if (!list) return;

    const roomBookings = summary.roomBookings || [];

    if (!roomBookings.length && !(summary.serviceBookings || []).length) {
      list.innerHTML =
        '<li class="account-notifications__item account-notifications__item--empty">' +
        renderAccountEmptyState("Уведомлений нет", "Здесь появятся сообщения о бронированиях и оплатах") +
        "</li>";
      return;
    }

    const notifications = [];

    roomBookings.forEach(function (booking) {
      notifications.push({
        heading: "Бронирование подтверждено",
        text:
          "Ваш заезд " +
          formatAccountDateRange(booking.checkIn, booking.checkOut) +
          " — " +
          booking.roomName,
        badge: getRoomBookingStatusMeta(booking).text,
        time: formatAccountDateShort(String(booking.createdAt || booking.checkIn).slice(0, 10)),
        icon: "assets/images/advantages-icon-bed.svg",
      });
    });

    (summary.serviceBookings || []).forEach(function (booking) {
      notifications.push({
        heading: "Бронирование услуги",
        text: booking.serviceName + " — " + formatAccountDateShort(booking.bookingDate),
        badge: "Подтверждено",
        time: formatAccountDateShort(String(booking.createdAt || booking.bookingDate).slice(0, 10)),
        icon: "assets/images/advantages-icon-bed.svg",
      });
    });

    list.innerHTML = notifications
      .map(function (item) {
        return (
          '<li class="account-notifications__item">' +
          '<span class="account-notifications__icon" aria-hidden="true">' +
          '<img src="' +
          item.icon +
          '" alt="" width="22" height="22" decoding="async" />' +
          "</span>" +
          '<div class="account-notifications__content">' +
          '<p class="account-notifications__heading">' +
          escapeHtml(item.heading) +
          "</p>" +
          '<p class="account-notifications__text">' +
          escapeHtml(item.text) +
          "</p>" +
          "</div>" +
          '<div class="account-notifications__meta">' +
          '<span class="account-notifications__badge">' +
          escapeHtml(item.badge) +
          "</span>" +
          '<time class="account-notifications__time">' +
          escapeHtml(item.time) +
          "</time>" +
          "</div>" +
          "</li>"
        );
      })
      .join("");
  }

  function renderAccountPaymentsPage(summary) {
    const tbody = document.querySelector("[data-account-payments-body]");
    if (!tbody) return;

    const payments = [];

    (summary.roomBookings || []).forEach(function (booking) {
      payments.push({
        date: formatAccountDateShort(String(booking.createdAt || booking.checkIn).slice(0, 10)),
        service: booking.roomName,
        nights: String(booking.nights),
        amount: formatRublesAmount(booking.totalPrice),
        status: booking.status === "cancelled" ? "Отменено" : "Успешно",
      });
    });

    (summary.serviceBookings || []).forEach(function (booking) {
      payments.push({
        date: formatAccountDateShort(String(booking.createdAt || booking.bookingDate).slice(0, 10)),
        service: booking.serviceName,
        nights: booking.hours + " ч",
        amount: formatRublesAmount(booking.totalPrice),
        status: booking.status === "cancelled" ? "Отменено" : "Успешно",
      });
    });

    if (!payments.length) {
      tbody.innerHTML =
        '<tr><td colspan="5">' +
        renderAccountEmptyState("Оплат пока нет", "История появится после первого бронирования") +
        "</td></tr>";
      return;
    }

    tbody.innerHTML = payments
      .map(function (payment) {
        return (
          "<tr>" +
          '<td data-label="Дата">' +
          escapeHtml(payment.date) +
          "</td>" +
          '<td class="account-payments__service" data-label="Услуга">' +
          '<span class="account-payments__service-name">' +
          escapeHtml(payment.service) +
          "</span>" +
          "</td>" +
          '<td data-label="Ночей">' +
          escapeHtml(payment.nights) +
          "</td>" +
          '<td data-label="Сумма">' +
          escapeHtml(payment.amount) +
          "</td>" +
          '<td data-label="Статус"><span class="account-payments__status">' +
          escapeHtml(payment.status) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function initAccountPages() {
    if (!document.querySelector(".account-profile")) return;

    const summary = await fetchAccountSummary();
    setAccountLoyalGuestBadge(summary);

    if (document.querySelector("[data-account-upcoming]")) {
      renderAccountOverviewPage(summary);
    }
    if (document.querySelector("[data-account-bookings]")) {
      renderAccountBookingsPage(summary);
    }
    if (document.querySelector("[data-account-notifications-list]")) {
      renderAccountNotificationsPage(summary);
    }
    if (document.querySelector("[data-account-payments-body]")) {
      renderAccountPaymentsPage(summary);
    }
  }

  function initAccountLogout() {
    document.querySelectorAll(".account-nav__link--logout").forEach(function (link) {
      link.addEventListener("click", async function (event) {
        event.preventDefault();

        try {
          const token = getAuthToken();
          if (token) {
            await fetch("/api/auth/logout", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
              },
            });
          }
        } catch (error) {
          /* ignore */
        }

        clearAccountData();
        window.location.href = "login.html";
      });
    });
  }

  function setOverflowTitle(element, value) {
    if (!element) return;
    const text = String(value || "").trim();
    element.title = text;
  }

  function syncAccountPasswordViewField(input) {
    if (!input) return;
    input.value = "••••••••";
    input.type = "password";
    input.readOnly = true;
    input.removeAttribute("title");
  }

  const ACCOUNT_PREFS_PREFIX = "olympAccountPrefs_";

  const DEFAULT_NOTIFICATIONS = {
    email: false,
    sms: false,
    promo: false,
    checkin: false,
  };

  function getAccountPrefsKey(userId) {
    return ACCOUNT_PREFS_PREFIX + userId;
  }

  function getAccountData() {
    const user = getAuthUser();
    if (!user) {
      return {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        notifications: Object.assign({}, DEFAULT_NOTIFICATIONS),
      };
    }

    let notifications = Object.assign({}, DEFAULT_NOTIFICATIONS);

    if (user.notifications && typeof user.notifications === "object") {
      notifications = Object.assign({}, DEFAULT_NOTIFICATIONS, user.notifications);
    } else {
      try {
        const raw = localStorage.getItem(getAccountPrefsKey(user.id));
        if (raw) {
          notifications = Object.assign({}, DEFAULT_NOTIFICATIONS, JSON.parse(raw));
        }
      } catch (error) {
        notifications = Object.assign({}, DEFAULT_NOTIFICATIONS);
      }
    }

    return {
      id: user.id,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      phone: user.phone || "",
      notifications: notifications,
    };
  }

  function saveAccountPrefs(userId, notifications) {
    localStorage.setItem(getAccountPrefsKey(userId), JSON.stringify(notifications));
  }

  function clearAccountData() {
    const user = getAuthUser();
    if (user && user.id) {
      localStorage.removeItem(getAccountPrefsKey(user.id));
    }
    clearAuthSession();
  }

  function getAccountInitials(firstName, lastName) {
    const first = String(firstName || "").trim().charAt(0);
    const last = String(lastName || "").trim().charAt(0);
    const initials = (first + last).toUpperCase();
    return initials || "АИ";
  }

  function applyAccountProfile(profile) {
    if (!profile) return;

    const data = getAccountData();
    const nameEl = profile.querySelector(".account-profile__name");
    const emailEl = profile.querySelector(".account-profile__email");
    const avatarEl = profile.querySelector(".account-profile__avatar");

    if (nameEl) {
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      nameEl.textContent = fullName;
      setOverflowTitle(nameEl, fullName);
    }

    if (emailEl) {
      emailEl.textContent = data.email;
      setOverflowTitle(emailEl, data.email);
    }

    if (avatarEl) {
      avatarEl.textContent = getAccountInitials(data.firstName, data.lastName);
    }

    const badgeEl = profile.querySelector(".account-profile__badge");
    if (badgeEl) {
      badgeEl.hidden = true;
    }
  }

  function initAccountProfile() {
    document.querySelectorAll(".account-profile").forEach(applyAccountProfile);
  }

  function initAccountSettings() {
    const settingsRoot = document.querySelector("[data-account-settings-root]");
    const form = document.querySelector("[data-account-settings]");
    if (!settingsRoot || !form) return;

    const firstNameInput = form.querySelector("#account-settings-first-name");
    const lastNameInput = form.querySelector("#account-settings-last-name");
    const emailInput = form.querySelector("#account-settings-email");
    const phoneInput = form.querySelector("#account-settings-phone");
    const passwordInput = form.querySelector("#account-settings-password");
    const passwordConfirmInput = form.querySelector("#account-settings-password-confirm");
    const passwordView = form.querySelector("[data-account-password-view]");
    const passwordEdit = form.querySelector("[data-account-password-edit]");
    const passwordViewInput = form.querySelector("#account-settings-password-view");
    const editBtn = form.querySelector("[data-account-edit]");
    const saveBtn = form.querySelector("[data-account-save]");
    const cancelBtn = form.querySelector("[data-account-cancel]");
    const messageEl = form.querySelector(".account-settings__message");
    const deleteBtn = form.querySelector("[data-account-delete]");
    const modal = document.getElementById("account-delete-modal");
    const editableInputs = [firstNameInput, lastNameInput, emailInput, phoneInput].filter(Boolean);
    const notifyInputs = {
      email: form.querySelector('[name="notify-email"]'),
      sms: form.querySelector('[name="notify-sms"]'),
      promo: form.querySelector('[name="notify-promo"]'),
      checkin: form.querySelector('[name="notify-checkin"]'),
    };

    let isEditing = false;
    const data = getAccountData();

    function fillFormFromData() {
      if (firstNameInput) {
        firstNameInput.value = data.firstName;
        setOverflowTitle(firstNameInput, data.firstName);
      }
      if (lastNameInput) {
        lastNameInput.value = data.lastName;
        setOverflowTitle(lastNameInput, data.lastName);
      }
      if (emailInput) {
        emailInput.value = data.email;
        setOverflowTitle(emailInput, data.email);
      }
      if (phoneInput) {
        phoneInput.value = data.phone;
        setOverflowTitle(phoneInput, data.phone);
      }

      Object.keys(notifyInputs).forEach(function (key) {
        if (notifyInputs[key]) {
          notifyInputs[key].checked = Boolean(data.notifications[key]);
        }
      });
    }

    fillFormFromData();
    syncAccountPasswordViewField(passwordViewInput);
    if (passwordViewInput && !passwordViewInput.closest(".password-field")) {
      bindPasswordVisibilityToggle(passwordViewInput);
    }

    function clearPasswordFields() {
      if (passwordInput) passwordInput.value = "";
      if (passwordConfirmInput) passwordConfirmInput.value = "";
    }

    function setEditingState(editing) {
      isEditing = editing;
      settingsRoot.classList.toggle("is-editing", editing);
      form.classList.toggle("account-settings__form--editing", editing);

      editableInputs.forEach(function (input) {
        if (input === emailInput) {
          input.readOnly = true;
          return;
        }
        input.readOnly = !editing;
      });

      Object.keys(notifyInputs).forEach(function (key) {
        if (notifyInputs[key]) {
          notifyInputs[key].disabled = !editing;
        }
      });

      if (passwordView) {
        passwordView.hidden = editing;
      }

      if (passwordEdit) {
        passwordEdit.hidden = !editing;
      }

      if (editBtn) {
        editBtn.hidden = editing;
      }

      if (saveBtn) {
        saveBtn.hidden = !editing;
      }

      if (cancelBtn) {
        cancelBtn.hidden = !editing;
      }

      if (!editing) {
        clearPasswordFields();
        syncAccountPasswordViewField(passwordViewInput);
      } else if (firstNameInput) {
        firstNameInput.focus();
      }
    }

    setEditingState(false);

    function showMessage(text, isError) {
      if (!messageEl) return;
      messageEl.textContent = text;
      messageEl.hidden = false;
      messageEl.classList.toggle("account-settings__message--error", Boolean(isError));
      messageEl.classList.toggle("account-settings__message--success", !isError);
    }

    function hideMessage() {
      if (!messageEl) return;
      messageEl.hidden = true;
      messageEl.textContent = "";
    }

    if (editBtn) {
      editBtn.addEventListener("click", function () {
        hideMessage();
        setEditingState(true);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        hideMessage();
        fillFormFromData();
        setEditingState(false);
      });
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!isEditing) return;

      hideMessage();

      const firstName = firstNameInput ? firstNameInput.value.trim() : "";
      const lastName = lastNameInput ? lastNameInput.value.trim() : "";
      const email = emailInput ? emailInput.value.trim() : "";
      const phone = phoneInput ? phoneInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";
      const passwordConfirm = passwordConfirmInput ? passwordConfirmInput.value : "";

      if (!firstName || !lastName || !email || !phone) {
        showMessage("Заполните все обязательные поля.", true);
        return;
      }

      const firstNameError = getNameError(firstName, true);
      if (firstNameError) {
        showMessage(firstNameError, true);
        return;
      }

      const lastNameError = getNameError(lastName, true);
      if (lastNameError) {
        showMessage(lastNameError, true);
        return;
      }

      const emailError = getEmailError(email, true);
      if (emailError) {
        showMessage(emailError, true);
        return;
      }

      if (password || passwordConfirm) {
        if (password !== passwordConfirm) {
          showMessage("Пароли не совпадают.", true);
          return;
        }

        const passwordError = getPasswordError(password);
        if (passwordError) {
          showMessage(passwordError, true);
          return;
        }
      }

      data.firstName = firstName;
      data.lastName = lastName;
      data.email = email;
      data.phone = phone;

      if (password) {
        data.password = password;
        syncAccountPasswordViewField(passwordViewInput);
      }

      data.notifications = {
        email: notifyInputs.email ? notifyInputs.email.checked : false,
        sms: notifyInputs.sms ? notifyInputs.sms.checked : false,
        promo: notifyInputs.promo ? notifyInputs.promo.checked : false,
        checkin: notifyInputs.checkin ? notifyInputs.checkin.checked : false,
      };

      const token = getAuthToken();
      if (!token) {
        redirectToLogin();
        return;
      }

      if (saveBtn) saveBtn.disabled = true;

      try {
        const response = await fetch("/api/auth/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            firstName: firstName,
            lastName: lastName,
            phone: phone,
            password: password || undefined,
            notifications: data.notifications,
          }),
        });

        let payload = {};
        try {
          payload = await response.json();
        } catch (error) {
          payload = {};
        }

        if (!response.ok) {
          throw new Error(payload.error || "Не удалось сохранить данные.");
        }

        const remember = isAuthRemembered();
        setAuthSession(token, payload.user, remember);

        if (payload.user && payload.user.id) {
          saveAccountPrefs(payload.user.id, data.notifications);
        }

        data.firstName = payload.user.firstName;
        data.lastName = payload.user.lastName;
        data.email = payload.user.email;
        data.phone = payload.user.phone;

        const panel = form.closest(".account-panel");
        applyAccountProfile(panel ? panel.querySelector(".account-profile") : null);
        setEditingState(false);
        showMessage("Данные аккаунта успешно сохранены.", false);
      } catch (error) {
        showMessage(error.message || "Не удалось сохранить данные.", true);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });

    if (!deleteBtn || !modal) return;

    const confirmBtn = modal.querySelector("[data-delete-confirm]");
    const cancelBtns = modal.querySelectorAll("[data-delete-cancel]");
    let lastFocusedElement = null;

    function openDeleteModal() {
      lastFocusedElement = document.activeElement;
      modal.hidden = false;
      document.body.classList.add("account-settings-modal-open");
      if (confirmBtn) confirmBtn.focus();
    }

    function closeDeleteModal() {
      modal.hidden = true;
      document.body.classList.remove("account-settings-modal-open");
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    }

    deleteBtn.addEventListener("click", openDeleteModal);

    cancelBtns.forEach(function (btn) {
      btn.addEventListener("click", closeDeleteModal);
    });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async function () {
        const passwordInput = modal.querySelector("[data-delete-password]");
        const password = passwordInput ? passwordInput.value : "";
        const token = getAuthToken();

        if (!password) {
          window.alert("Введите пароль для подтверждения удаления.");
          if (passwordInput) passwordInput.focus();
          return;
        }

        if (!token) {
          redirectToLogin();
          return;
        }

        confirmBtn.disabled = true;

        try {
          const response = await fetch("/api/auth/account", {
            method: "DELETE",
            headers: buildAuthHeaders(),
            body: JSON.stringify({ password: password }),
          });

          let payload = {};
          try {
            payload = await response.json();
          } catch (error) {
            payload = {};
          }

          if (!response.ok) {
            throw new Error(payload.error || "Не удалось удалить аккаунт.");
          }

          clearAccountData();
          window.location.href = "login.html";
        } catch (error) {
          window.alert(error.message || "Не удалось удалить аккаунт.");
        } finally {
          confirmBtn.disabled = false;
        }
      });
    }

    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !modal.hidden) {
        closeDeleteModal();
      }
    });
  }

  function scrollToRoomBookingSection() {
    const section = document.getElementById("room-booking");
    if (!section) return;

    section.scrollIntoView({ behavior: "smooth", block: "start" });

    window.setTimeout(function () {
      const form = section.querySelector(".room-booking__form");
      const firstInput = form && form.querySelector("input, select, textarea, button");
      if (firstInput && typeof firstInput.focus === "function") {
        firstInput.focus();
      }
    }, 400);
  }

  function formatRussianDate(iso) {
    if (!iso) return "—";
    const parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  function extractPriceAmount(text) {
    const match = String(text || "").match(/(\d[\d\s]*)/);
    if (!match) return "0";
    return match[1].replace(/\s/g, "");
  }

  function formatPriceRubles(text) {
    return `${extractPriceAmount(text)} рублей`;
  }

  function computeStayNights(checkIn, checkOut) {
    const start = parseAccountISODate(checkIn);
    const end = parseAccountISODate(checkOut);
    if (!start || !end || end <= start) return 1;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round((end - start) / msPerDay));
  }

  function formatNightsLabel(count) {
    const nights = Math.max(1, Number(count) || 1);
    if (nights === 1) return "1 ночь";
    if (nights >= 2 && nights <= 4) return nights + " ночи";
    return nights + " ночей";
  }

  function formatRublesAmount(amount) {
    return (
      String(Math.round(Number(amount) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " рублей"
    );
  }

  let openBookingPaymentModal = null;
  let refreshBookingAvailability = null;

  function initRoomTariffSelection() {
    const grid = document.querySelector(".room-tariffs__grid");
    const priceBox = document.querySelector(".room-detail__price");
    const priceValueEl = document.querySelector(".room-detail__price-value");
    const priceNoteEl = document.querySelector(".room-detail__price-note");
    const tariffSelect = document.querySelector('.room-booking__form select[name="tariff"]');
    const tariffDisplayEl = document.querySelector("[data-room-booking-tariff]");

    if (!grid || !priceValueEl) return;

    const cards = Array.from(grid.querySelectorAll(".room-tariffs__card"));
    const tariffValues = ["basic", "half-board", "full-board"];

    function buildNote(index, tariffText) {
      if (index === 0) {
        return "Тариф «Основной» (проживание + завтрак)";
      }

      return `Тариф «${tariffText}»`;
    }

    function updateTariffDisplay(tariffText, priceText) {
      if (!tariffDisplayEl) return;
      tariffDisplayEl.textContent = `${tariffText} — ${priceText}`;
    }

    function applyTariff(card, options) {
      const settings = options || {};
      const index = cards.indexOf(card);
      if (index < 0) return;

      const priceEl = card.querySelector(".room-tariffs__price");
      const textEl = card.querySelector(".room-tariffs__text");
      const priceText = priceEl ? priceEl.textContent.trim() : "";
      const tariffText = textEl ? textEl.textContent.trim() : "";

      priceValueEl.textContent = priceText;

      if (priceNoteEl) {
        priceNoteEl.textContent = buildNote(index, tariffText);
      }

      cards.forEach(function (item) {
        item.classList.toggle("is-selected", item === card);
      });

      if (tariffSelect && tariffValues[index]) {
        tariffSelect.value = tariffValues[index];
      }

      updateTariffDisplay(tariffText, priceText);

      if (priceBox) {
        priceBox.classList.remove("is-updated");
        void priceBox.offsetWidth;
        priceBox.classList.add("is-updated");
      }

      if (settings.scroll !== false) {
        scrollToRoomBookingSection();
      }
    }

    cards.forEach(function (card) {
      const btn = card.querySelector(".room-tariffs__btn");
      if (!btn) return;

      btn.addEventListener("click", function (event) {
        event.preventDefault();
        applyTariff(card);
      });
    });

    if (tariffSelect) {
      tariffSelect.addEventListener("change", function () {
        const index = tariffValues.indexOf(tariffSelect.value);
        if (index >= 0 && cards[index]) {
          applyTariff(cards[index], { scroll: false });
          return;
        }

        if (tariffSelect.selectedOptions.length) {
          updateTariffDisplay(
            tariffSelect.selectedOptions[0].textContent.trim(),
            priceValueEl.textContent.trim()
          );
        }
      });
    }

    if (cards.length) {
      applyTariff(cards[0], { scroll: false });
    }
  }

  function initRoomPaymentModal() {
    const modal = document.getElementById("room-payment-modal");
    if (!modal) return;

    const bookingPage = document.querySelector("[data-booking-page]");
    const roomBookingForm = document.querySelector(".room-booking__form");
    const roomEl = modal.querySelector("[data-room-payment-room]");
    const priceEl = modal.querySelector("[data-room-payment-price]");
    const dateEl = modal.querySelector("[data-room-payment-date]");
    const guestsEl = modal.querySelector("[data-room-payment-guests]");
    const tariffEl = modal.querySelector("[data-room-payment-tariff]");
    const totalEl = modal.querySelector("[data-room-payment-total]");
    const nightsEl = modal.querySelector("[data-room-payment-nights]");
    const breakdownEl = modal.querySelector("[data-room-payment-breakdown]");
    const form = modal.querySelector(".room-payment-modal__form");
    const closeTriggers = modal.querySelectorAll("[data-room-payment-close]");
    const openTriggers = document.querySelectorAll(".room-detail__btn--primary");
    const nameInput = modal.querySelector("[data-booking-payment-name]");
    const phoneInput = modal.querySelector("[data-booking-payment-phone]");
    const tariffSelectWrap = modal.querySelector("[data-booking-payment-tariff-wrap]");
    const tariffSelect = modal.querySelector("[data-booking-payment-tariff]");
    let lastFocusedElement = null;
    let pendingBooking = null;

    function setBookingTariffSelectVisible(visible) {
      if (tariffSelectWrap) {
        tariffSelectWrap.hidden = !visible;
      }
    }

    function populateBookingTariffSelect(card, slug, selectedTariff) {
      if (!tariffSelect) return;

      const prices = getCardTariffPrices(card, slug);
      tariffSelect.innerHTML = ROOM_TARIFF_OPTIONS.map(function (option) {
        const price = prices[option.value];
        return (
          '<option value="' +
          option.value +
          '">' +
          option.optionPrefix +
          " — " +
          price +
          " руб. / ночь</option>"
        );
      }).join("");

      const nextTariff = selectedTariff || tariffSelect.value || "basic";
      tariffSelect.value = ROOM_TARIFF_OPTIONS.some(function (option) {
        return option.value === nextTariff;
      })
        ? nextTariff
        : "basic";
    }

    function updatePaymentTotals(pricePerNight, checkIn, checkOut) {
      const nightly = Number(extractPriceAmount(String(pricePerNight))) || 0;
      const nights = computeStayNights(checkIn, checkOut);
      const total = nightly * nights;

      if (priceEl) {
        priceEl.textContent = formatPriceRubles(String(nightly)) + " / ночь";
      }

      if (nightsEl) {
        nightsEl.textContent = formatNightsLabel(nights);
      }

      if (totalEl) {
        totalEl.textContent = formatRublesAmount(total);
      }

      if (breakdownEl) {
        breakdownEl.textContent =
          formatNightsLabel(nights) +
          " × " +
          String(nightly).replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
          " руб.";
        breakdownEl.hidden = false;
      }
    }

    function syncBookingTariffSummary() {
      if (!pendingBooking) return;

      const prices = getCardTariffPrices(pendingBooking.card, pendingBooking.slug);
      const selectedTariff = tariffSelect ? tariffSelect.value : pendingBooking.tariff || "basic";
      const price = prices[selectedTariff] || prices.basic;

      pendingBooking.tariff = selectedTariff;

      if (tariffEl) {
        tariffEl.textContent = getRoomTariffOptionLabel(selectedTariff);
      }

      updatePaymentTotals(
        price,
        pendingBooking.dates.checkIn,
        pendingBooking.dates.checkOut
      );
    }

    function getBookingFormValue(selector) {
      const field = document.querySelector(`.room-booking__form ${selector}`);
      return field ? field.value : "";
    }

    function getGuestsLabel() {
      const guestsSelect = document.querySelector('.room-booking__form select[name="guests"]');
      if (guestsSelect && guestsSelect.selectedOptions.length) {
        return guestsSelect.selectedOptions[0].textContent.trim();
      }

      const tags = document.querySelectorAll(".room-detail__tag span");
      for (let i = 0; i < tags.length; i += 1) {
        const text = tags[i].textContent.trim();
        if (/гост/i.test(text)) {
          return text;
        }
      }

      return "1 гость";
    }

    function getTariffLabel() {
      const tariffSelect = document.querySelector('.room-booking__form select[name="tariff"]');
      if (tariffSelect && tariffSelect.selectedOptions.length) {
        return tariffSelect.selectedOptions[0].textContent.trim();
      }

      const tariffDisplay = document.querySelector("[data-room-booking-tariff]");
      if (tariffDisplay) {
        return tariffDisplay.textContent.trim();
      }

      return "—";
    }

    function populateSummaryFromRoomForm() {
      const title = document.getElementById("room-detail-title");
      const priceValue = document.querySelector(".room-detail__price-value");
      const checkin = getBookingFormValue('[name="checkin"]');
      const checkout = getBookingFormValue('[name="checkout"]');
      const priceText = priceValue ? priceValue.textContent.trim() : "0";
      const dateText =
        checkin && checkout
          ? `${formatRussianDate(checkin)} — ${formatRussianDate(checkout)}`
          : formatRussianDate(checkin);

      if (roomEl) {
        roomEl.textContent = title ? title.textContent.trim() : "—";
      }

      if (dateEl) {
        dateEl.textContent = dateText;
      }

      if (guestsEl) {
        guestsEl.textContent = getGuestsLabel();
      }

      if (tariffEl) {
        tariffEl.textContent = getTariffLabel();
      }

      updatePaymentTotals(priceText, checkin, checkout);
    }

    function populateSummaryFromBookingCard(slug, card) {
      const titleEl = card.querySelector(".booking-rooms__card-title");
      const priceValueEl = card.querySelector(".booking-rooms__price-value");
      const filterForm = bookingPage ? bookingPage.querySelector(".booking-filters__form") : null;
      const checkInEl = filterForm ? filterForm.querySelector('[name="check-in"]') : null;
      const checkOutEl = filterForm ? filterForm.querySelector('[name="check-out"]') : null;
      const guestsElForm = filterForm ? filterForm.querySelector('[name="guests"]') : null;
      const checkIn = checkInEl ? checkInEl.value : "";
      const checkOut = checkOutEl ? checkOutEl.value : "";
      const guestsCount = guestsElForm ? clampGuestCount(guestsElForm.value) : 1;
      const priceText = priceValueEl ? priceValueEl.textContent.trim() : "0";
      const dateText =
        checkIn && checkOut
          ? `${formatRussianDate(checkIn)} — ${formatRussianDate(checkOut)}`
          : formatRussianDate(checkIn);

      if (roomEl) {
        roomEl.textContent = titleEl ? titleEl.textContent.trim() : slug;
      }

      if (dateEl) {
        dateEl.textContent = dateText;
      }

      if (guestsEl) {
        guestsEl.textContent =
          guestsCount === 1 ? "1 гость" : `${guestsCount} ${guestsCount < 5 ? "гостя" : "гостей"}`;
      }

      if (tariffEl) {
        tariffEl.textContent = getRoomTariffOptionLabel("basic");
      }

      setBookingTariffSelectVisible(true);
      populateBookingTariffSelect(card, slug, "basic");
      syncBookingTariffSummary();
    }

    function syncBookingContactFields() {
      if (!nameInput && !phoneInput) return;

      const user = getAuthUser();
      if (user) {
        if (nameInput && !nameInput.value) {
          nameInput.value = (user.firstName + " " + user.lastName).trim();
        }
        if (phoneInput && !phoneInput.value && user.phone) {
          phoneInput.value = user.phone;
        }
      }
    }

    function openModal() {
      if (pendingBooking) {
        populateSummaryFromBookingCard(pendingBooking.slug, pendingBooking.card);
        syncBookingContactFields();
      } else {
        setBookingTariffSelectVisible(false);
        populateSummaryFromRoomForm();
      }

      lastFocusedElement = document.activeElement;
      modal.hidden = false;
      document.body.classList.add("room-payment-modal-open");

      const firstField = modal.querySelector(".room-payment-modal__control");
      if (firstField) {
        firstField.focus();
      }
    }

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove("room-payment-modal-open");
      pendingBooking = null;
      setBookingTariffSelectVisible(false);

      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    }

    if (roomBookingForm) {
      openTriggers.forEach(function (trigger) {
        trigger.addEventListener("click", function (event) {
          event.preventDefault();
          scrollToRoomBookingSection();
        });
      });

      roomBookingForm.addEventListener("submit", function (event) {
        event.preventDefault();

        if (!roomBookingForm.checkValidity()) {
          roomBookingForm.reportValidity();
          return;
        }

        pendingBooking = null;
        openModal();
      });
    }

    if (bookingPage) {
      openBookingPaymentModal = function (slug, card, dates) {
        if (!dates.checkIn || !dates.checkOut) {
          window.alert("Выберите даты заезда и выезда в фильтрах слева.");
          return;
        }

        if (dates.guests < 1 || dates.guests > MAX_GUESTS) {
          window.alert("Количество гостей должно быть от 1 до " + MAX_GUESTS + ".");
          return;
        }

        pendingBooking = { slug: slug, card: card, dates: dates, tariff: "basic" };
        openModal();
      };

      if (tariffSelect) {
        tariffSelect.addEventListener("change", syncBookingTariffSummary);
      }
    }

    closeTriggers.forEach(function (trigger) {
      trigger.addEventListener("click", closeModal);
    });

    if (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const bookingForm = document.querySelector(".room-booking__form");
        const user = getAuthUser();
        const submitBtn = form.querySelector('[type="submit"]');
        let roomSlug = document.body.getAttribute("data-room-slug") || "single-standard";
        let guestName = "";
        let phone = "";
        let checkIn = "";
        let checkOut = "";
        let guests = 1;
        let tariff = "basic";

        if (pendingBooking) {
          roomSlug = pendingBooking.slug;
          checkIn = pendingBooking.dates.checkIn;
          checkOut = pendingBooking.dates.checkOut;
          guests = pendingBooking.dates.guests;
          tariff = pendingBooking.tariff || (tariffSelect ? tariffSelect.value : "basic");
          guestName = nameInput ? nameInput.value.trim() : "";
          phone = phoneInput ? phoneInput.value.trim() : "";
        } else if (bookingForm) {
          guestName = bookingForm.name ? bookingForm.name.value.trim() : "";
          phone = bookingForm.phone ? bookingForm.phone.value.trim() : "";
          checkIn = getBookingFormValue('[name="checkin"]');
          checkOut = getBookingFormValue('[name="checkout"]');
          const guestsSelect = document.querySelector('.room-booking__form select[name="guests"]');
          const tariffSelect = document.querySelector('.room-booking__form select[name="tariff"]');
          guests = guestsSelect ? clampGuestCount(guestsSelect.value) : 1;
          tariff = tariffSelect ? tariffSelect.value : "basic";
        }

        if (guests > MAX_GUESTS) {
          window.alert("Количество гостей должно быть от 1 до " + MAX_GUESTS + ".");
          return;
        }

        if (!guestName || !phone || !checkIn || !checkOut) {
          window.alert("Заполните все данные для бронирования перед оплатой.");
          return;
        }

        const guestNameError = getNameError(guestName, true);
        if (guestNameError) {
          window.alert(guestNameError);
          return;
        }

        const demoError = validatePaymentDemo(form);
        if (demoError) return;

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        if (submitBtn) submitBtn.disabled = true;

        try {
          const response = await fetch("/api/bookings", {
            method: "POST",
            headers: buildAuthHeaders(),
            body: JSON.stringify({
              roomSlug: roomSlug,
              guestName: guestName,
              phone: phone,
              email: user ? user.email : "",
              checkIn: checkIn,
              checkOut: checkOut,
              guests: guests,
              tariff: tariff,
            }),
          });

          let data = {};
          try {
            data = await response.json();
          } catch (error) {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              (data.errors && data.errors[0]) || data.error || "Не удалось создать бронирование."
            );
          }

          closeModal();
          window.alert(data.message || "Бронирование успешно создано.");

          if (bookingPage && refreshBookingAvailability) {
            await refreshBookingAvailability();
          }
        } catch (error) {
          window.alert(error.message || "Не удалось создать бронирование.");
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !modal.hidden) {
        closeModal();
      }
    });
  }

  function normalizeLoginEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  const EMAIL_PATTERN = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const PASSWORD_MIN_LENGTH = 6;
  const PASSWORD_MAX_LENGTH = 64;
  const EMAIL_MAX_LENGTH = 100;
  const NAME_MAX_LENGTH = 80;
  const NAME_MIN_LENGTH = 2;

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidEmail(value) {
    return !getEmailError(value, false);
  }

  function getEmailError(value, required) {
    const email = String(value || "").trim();
    if (!email) return required ? "Укажите email." : "";
    if (email.length > EMAIL_MAX_LENGTH) {
      return "Email не должен быть длиннее " + EMAIL_MAX_LENGTH + " символов.";
    }
    if (!email.includes("@")) {
      return "Укажите полный email с @ и доменом, например name@gmail.com или name@mail.ru.";
    }
    if ((email.match(/@/g) || []).length !== 1) {
      return "Email должен содержать один символ @.";
    }
    const parts = email.split("@");
    const localPart = parts[0];
    const domainPart = parts[1];
    if (!localPart || !domainPart) {
      return "Укажите имя и домен почты через @, например name@gmail.com.";
    }
    if (!domainPart.includes(".")) {
      return "Укажите домен после @, например gmail.com, mail.ru, yandex.ru или outlook.com.";
    }
    if (domainPart.startsWith(".") || domainPart.endsWith(".") || domainPart.includes("..")) {
      return "Некорректный домен email.";
    }
    const tld = domainPart.split(".").pop();
    if (!tld || tld.length < 2) {
      return "Укажите полный домен, например gmail.com или outlook.com.";
    }
    if (!EMAIL_PATTERN.test(email)) {
      return "Укажите корректный email, например name@gmail.com или name@mail.ru.";
    }
    return "";
  }

  function getPasswordError(value) {
    const password = String(value || "");
    if (!password) return "Укажите пароль.";
    if (password.length < PASSWORD_MIN_LENGTH) {
      return "Пароль должен содержать не менее " + PASSWORD_MIN_LENGTH + " символов.";
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return "Пароль не должен быть длиннее " + PASSWORD_MAX_LENGTH + " символов.";
    }
    return "";
  }

  function getNameError(value, required) {
    const name = String(value || "").trim();
    if (!name) return required ? "Укажите имя." : "";
    if (name.length < NAME_MIN_LENGTH) {
      return "Имя должно содержать минимум " + NAME_MIN_LENGTH + " символа.";
    }
    if (name.length > NAME_MAX_LENGTH) {
      return "Имя не должно быть длиннее " + NAME_MAX_LENGTH + " символов.";
    }
    return "";
  }

  function trimToMaxLength(input, maxLength) {
    if (!input || !maxLength) return;
    if (input.value.length > maxLength) {
      input.value = input.value.slice(0, maxLength);
    }
  }

  function formatCardNumber(value) {
    return digitsOnly(value)
      .slice(0, 16)
      .replace(/(\d{4})(?=\d)/g, "$1 ")
      .trim();
  }

  function formatCardExpiry(value) {
    const digits = digitsOnly(value).slice(0, 4);
    if (digits.length <= 2) return digits;
    return digits.slice(0, 2) + "/" + digits.slice(2);
  }

  function formatCardCvv(value) {
    return digitsOnly(value).slice(0, 3);
  }

  function formatCardholder(value) {
    return String(value || "")
      .replace(/[^a-zA-Z\s-]/g, "")
      .replace(/\s{2,}/g, " ")
      .toUpperCase();
  }

  function formatPhoneRu(value) {
    let digits = digitsOnly(value);
    if (digits.startsWith("8")) digits = "7" + digits.slice(1);
    if (!digits.startsWith("7")) digits = "7" + digits;
    digits = digits.slice(0, 11);

    let result = "+7";
    if (digits.length > 1) result += " (" + digits.slice(1, 4);
    if (digits.length >= 4) result += ")";
    if (digits.length > 4) result += " " + digits.slice(4, 7);
    if (digits.length > 7) result += " " + digits.slice(7, 9);
    if (digits.length > 9) result += " - " + digits.slice(9, 11);
    return result;
  }

  function passesLuhn(number) {
    let sum = 0;
    let alternate = false;

    for (let i = number.length - 1; i >= 0; i -= 1) {
      let digit = Number(number.charAt(i));
      if (alternate) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      alternate = !alternate;
    }

    return sum % 10 === 0;
  }

  function getCardNumberError(value) {
    const digits = digitsOnly(value);
    if (digits.length !== 16) return "Введите номер карты в формате 0000 0000 0000 0000.";
    if (!passesLuhn(digits)) return "Некорректный номер карты.";
    return "";
  }

  function getCardExpiryError(value) {
    const digits = digitsOnly(value);
    if (digits.length !== 4) return "Укажите срок действия в формате MM/YY.";
    const month = Number(digits.slice(0, 2));
    const year = Number(digits.slice(2, 4));
    if (month < 1 || month > 12) return "Некорректный месяц.";

    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;

    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      return "Срок действия карты не может быть в прошлом.";
    }

    return "";
  }

  function getCardCvvError(value) {
    const digits = digitsOnly(value);
    if (digits.length !== 3) return "CVV должен содержать 3 цифры.";
    return "";
  }

  function getCardholderError(value) {
    const name = String(value || "").trim();
    if (name.length < 2) return "Укажите имя держателя карты.";
    if (!/^[A-Z][A-Z\s-]*$/.test(name)) return "Имя держателя указывается латиницей.";
    return "";
  }

  function setFieldValidity(input, message) {
    if (!input) return;
    input.setCustomValidity(message || "");
    input.classList.toggle("is-invalid", Boolean(message));
  }

  function bindCardNumberInput(input) {
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "cc-number");
    input.setAttribute("placeholder", "0000 0000 0000 0000");
    input.setAttribute("maxlength", "19");

    input.addEventListener("input", function () {
      const digitsBefore = digitsOnly(input.value.slice(0, input.selectionStart)).length;
      input.value = formatCardNumber(input.value);

      let newPos = input.value.length;
      let digitCount = 0;

      for (let i = 0; i < input.value.length; i += 1) {
        if (/\d/.test(input.value[i])) {
          digitCount += 1;
          if (digitCount === digitsBefore) {
            newPos = i + 1;
            break;
          }
        }
      }

      if (digitsBefore === 0) newPos = 0;
      input.setSelectionRange(newPos, newPos);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      setFieldValidity(input, getCardNumberError(input.value));
    });
  }

  function bindCardExpiryInput(input) {
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "cc-exp");
    input.setAttribute("placeholder", "MM/YY");
    input.setAttribute("maxlength", "5");

    input.addEventListener("input", function () {
      input.value = formatCardExpiry(input.value);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      setFieldValidity(input, getCardExpiryError(input.value));
    });
  }

  function bindCardCvvInput(input) {
    input.type = "text";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "cc-csc");
    input.setAttribute("placeholder", "000");
    input.setAttribute("maxlength", "3");

    input.addEventListener("input", function () {
      input.value = formatCardCvv(input.value);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      setFieldValidity(input, getCardCvvError(input.value));
    });
  }

  function bindCardholderInput(input) {
    input.setAttribute("autocomplete", "cc-name");
    input.setAttribute("placeholder", "IVAN IVANOV");

    input.addEventListener("input", function () {
      input.value = formatCardholder(input.value);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      setFieldValidity(input, getCardholderError(input.value));
    });
  }

  function bindEmailInput(input) {
    input.setAttribute("inputmode", "email");
    input.setAttribute("maxlength", String(EMAIL_MAX_LENGTH));

    input.addEventListener("input", function () {
      trimToMaxLength(input, EMAIL_MAX_LENGTH);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      input.value = String(input.value || "").trim().slice(0, EMAIL_MAX_LENGTH);
      setFieldValidity(input, getEmailError(input.value, input.required));
    });
  }

  function bindPasswordVisibilityToggle(input) {
    if (!input || input.closest(".password-field")) return;

    const wrap = document.createElement("span");
    wrap.className = "password-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "password-field__toggle";
    toggleBtn.setAttribute("aria-label", "Показать пароль");
    toggleBtn.textContent = "Показать";

    toggleBtn.addEventListener("click", function () {
      const isVisible = input.type === "text";
      input.type = isVisible ? "password" : "text";
      toggleBtn.textContent = isVisible ? "Показать" : "Скрыть";
      toggleBtn.setAttribute("aria-label", isVisible ? "Показать пароль" : "Скрыть пароль");
    });

    wrap.appendChild(toggleBtn);
  }

  function bindPasswordInput(input) {
    if (input.id === "account-settings-password-view") return;

    input.setAttribute("minlength", String(PASSWORD_MIN_LENGTH));
    input.setAttribute("maxlength", String(PASSWORD_MAX_LENGTH));

    input.addEventListener("input", function () {
      trimToMaxLength(input, PASSWORD_MAX_LENGTH);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      if (!input.value) {
        setFieldValidity(input, "");
        return;
      }
      setFieldValidity(input, getPasswordError(input.value));
    });

    bindPasswordVisibilityToggle(input);
  }

  function bindNameInput(input) {
    input.setAttribute("maxlength", String(NAME_MAX_LENGTH));

    input.addEventListener("input", function () {
      trimToMaxLength(input, NAME_MAX_LENGTH);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      input.value = String(input.value || "").trim().slice(0, NAME_MAX_LENGTH);
      setFieldValidity(input, getNameError(input.value, input.required));
    });
  }

  function bindBookingDateInput(input) {
    if (!input || input.type !== "date") return;
    if (input.dataset.bookingDateBound === "1") return;
    input.dataset.bookingDateBound = "1";

    const todayStr = localISODate(startOfToday());
    if (!input.min || input.min < todayStr) {
      input.min = todayStr;
    }

    function syncDateLimits() {
      clampDateInputToRange(input);
    }

    syncDateLimits();
    input.addEventListener("input", syncDateLimits);
    input.addEventListener("change", syncDateLimits);
  }

  function bindPhoneInput(input) {
    if (input.dataset.phoneMaskBound === "1") return;
    input.dataset.phoneMaskBound = "1";

    input.addEventListener("input", function () {
      input.value = formatPhoneRu(input.value);
      setFieldValidity(input, "");
    });

    input.addEventListener("blur", function () {
      const digits = digitsOnly(input.value);
      if (!digits) {
        setFieldValidity(input, "");
        return;
      }
      if (digits.length < 11) {
        setFieldValidity(input, "Укажите телефон в формате +7 (000) 000 00 - 00.");
        return;
      }
      setFieldValidity(input, "");
    });
  }

  function validatePaymentDemo(form) {
    if (!form) return "";

    const checkbox = form.querySelector('[name="payment-demo-confirm"]');
    if (!checkbox) return "";

    if (!checkbox.checked) {
      window.alert("Подтвердите демонстрационную оплату для завершения бронирования.");
      return "confirm";
    }

    return "";
  }

  function initFormValidation() {
    document.querySelectorAll('input[name="email"], input[type="email"]').forEach(bindEmailInput);
    document
      .querySelectorAll(
        'input[type="password"][name="password"], input[type="password"][name="password-confirm"], #account-settings-password, #account-settings-password-confirm'
      )
      .forEach(bindPasswordInput);
    document
      .querySelectorAll(
        'input[name="name"], input[name="first-name"], input[name="last-name"], input[name="guest-name"], input[data-booking-payment-name]'
      )
      .forEach(bindNameInput);
    document.querySelectorAll('input[type="tel"], input[name="phone"]').forEach(bindPhoneInput);
    document.querySelectorAll('input[name="booking-date"]').forEach(bindBookingDateInput);
  }

  function appendAuthMessage(form, className) {
    let messageEl = form.querySelector("[data-auth-message]");
    if (!messageEl) {
      messageEl = document.createElement("p");
      messageEl.className = className;
      messageEl.dataset.authMessage = "";
      messageEl.hidden = true;
      messageEl.setAttribute("role", "alert");
      form.appendChild(messageEl);
    }
    return messageEl;
  }

  function initForgotPasswordForm() {
    const form = document.querySelector("[data-auth-forgot]");
    if (!form) return;

    const messageEl = appendAuthMessage(form, "login-page__error");
    let linkBox = form.querySelector("[data-auth-reset-link]");
    if (!linkBox) {
      linkBox = document.createElement("div");
      linkBox.className = "login-page__reset-link";
      linkBox.dataset.authResetLink = "";
      linkBox.hidden = true;
      form.insertBefore(linkBox, form.querySelector(".login-page__register"));
    }

    function showMessage(text, isError) {
      messageEl.textContent = text;
      messageEl.hidden = !text;
      messageEl.classList.toggle("login-page__error", isError !== false);
      messageEl.classList.toggle("login-page__success", isError === false);
    }

    function showResetLink(url) {
      if (!url) {
        linkBox.hidden = true;
        linkBox.innerHTML = "";
        return;
      }
      linkBox.hidden = false;
      linkBox.innerHTML =
        '<p class="login-page__reset-link-label">Ссылка для сброса пароля (действует 1 час):</p>' +
        '<a class="login-page__reset-link-anchor" href="' +
        escapeHtml(url) +
        '">' +
        escapeHtml(url) +
        "</a>";
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showMessage("");
      showResetLink("");

      const email = normalizeLoginEmail(form.email ? form.email.value : "");
      if (!email) {
        showMessage("Укажите email.");
        return;
      }

      const emailError = getEmailError(email, true);
      if (emailError) {
        showMessage(emailError);
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        let data = {};
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          throw new Error(data.error || "Не удалось отправить запрос.");
        }

        showMessage(data.message || "Запрос принят.", false);
        showResetLink(data.resetLink || "");
        form.email.disabled = true;
      } catch (error) {
        if (!window.navigator.onLine || String(error.message).includes("fetch")) {
          showMessage(
            "Не удалось связаться с сервером. Запустите npm start и откройте http://localhost:3000/forgot-password.html"
          );
          return;
        }
        showMessage(error.message || "Не удалось отправить запрос.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  async function initResetPasswordForm() {
    const form = document.querySelector("[data-auth-reset]");
    if (!form) return;

    const leadEl = document.querySelector("[data-reset-password-lead]");
    const invalidEl = document.querySelector("[data-reset-password-invalid]");
    const tokenInput = form.querySelector("[data-reset-token]");
    const messageEl = appendAuthMessage(form, "login-page__error");
    const params = new URLSearchParams(window.location.search);
    const token = String(params.get("token") || "").trim();

    function showMessage(text, isError) {
      messageEl.textContent = text;
      messageEl.hidden = !text;
      messageEl.classList.toggle("login-page__error", isError !== false);
      messageEl.classList.toggle("login-page__success", isError === false);
    }

    function showInvalidState() {
      if (leadEl) {
        leadEl.textContent =
          "Ссылка недействительна или устарела. Запросите восстановление пароля снова.";
      }
      form.hidden = true;
      if (invalidEl) invalidEl.hidden = false;
    }

    if (!token) {
      showInvalidState();
      return;
    }

    if (tokenInput) tokenInput.value = token;

    try {
      const response = await fetch(
        "/api/auth/reset-password?token=" + encodeURIComponent(token)
      );
      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }

      if (!response.ok || !data.valid) {
        showInvalidState();
        return;
      }
    } catch (error) {
      showMessage(
        "Не удалось проверить ссылку. Запустите npm start и откройте страницу через http://localhost:3000"
      );
      form.hidden = true;
      return;
    }

    form.hidden = false;
    if (invalidEl) invalidEl.hidden = true;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showMessage("");

      const password = form.password ? form.password.value : "";
      const passwordConfirm = form["password-confirm"]
        ? form["password-confirm"].value
        : "";

      if (!password || !passwordConfirm) {
        showMessage("Укажите новый пароль и подтверждение.");
        return;
      }

      if (password !== passwordConfirm) {
        showMessage("Пароли не совпадают.");
        return;
      }

      const passwordError = getPasswordError(password);
      if (passwordError) {
        showMessage(passwordError);
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password, passwordConfirm }),
        });

        let data = {};
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          throw new Error(data.error || "Не удалось обновить пароль.");
        }

        showMessage(data.message || "Пароль обновлён.", false);
        form.hidden = true;
        if (leadEl) {
          leadEl.textContent = "Пароль сохранён. Через несколько секунд откроется страница входа.";
        }
        window.setTimeout(function () {
          window.location.href = "login.html";
        }, 2500);
      } catch (error) {
        showMessage(error.message || "Не удалось обновить пароль.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function initLoginForm() {
    const form = document.querySelector("[data-auth-login]");
    if (!form) return;

    let messageEl = form.querySelector("[data-auth-message]");
    if (!messageEl) {
      messageEl = document.createElement("p");
      messageEl.className = "login-page__error";
      messageEl.dataset.authMessage = "";
      messageEl.hidden = true;
      messageEl.setAttribute("role", "alert");
      form.appendChild(messageEl);
    }

    function showMessage(text) {
      messageEl.textContent = text;
      messageEl.hidden = !text;
    }

    const loginParams = new URLSearchParams(window.location.search);
    if (loginParams.get("error") === "not_admin") {
      showMessage(
        "У этого аккаунта нет прав администратора. Войдите с email администратора (см. README или ADMIN_EMAIL в .env)."
      );
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showMessage("");

      const email = normalizeLoginEmail(form.email ? form.email.value : "");
      const password = form.password ? form.password.value : "";

      if (!email || !password) {
        showMessage("Укажите email и пароль.");
        return;
      }

      const emailError = getEmailError(email, true);
      if (emailError) {
        showMessage(emailError);
        return;
      }

      const passwordError = getPasswordError(password);
      if (passwordError) {
        showMessage(passwordError);
        return;
      }

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        let data = {};
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          throw new Error(data.error || "Не удалось выполнить вход.");
        }

        const remember = form.remember ? form.remember.checked : false;
        setAuthSession(data.token, data.user, remember);
        redirectAfterAuth(data.user, remember);
      } catch (error) {
        if (!window.navigator.onLine || String(error.message).includes("fetch")) {
          showMessage("Не удалось связаться с сервером. Запустите npm start и откройте http://localhost:3000/login.html");
          return;
        }
        showMessage(error.message || "Не удалось выполнить вход.");
      }
    });
  }

  function redirectAfterAuth(user, remember) {
    const params = new URLSearchParams(window.location.search);
    const rawNext = String(params.get("next") || "").trim();

    if (rawNext.split("#")[0].toLowerCase() === "admin.html" && user && user.role !== "admin") {
      window.location.href = "login.html?error=not_admin";
      return;
    }

    const next = getSafeRedirectTarget(rawNext, user);

    if (user && user.role === "admin" && (!next || next.split("#")[0].toLowerCase() === "admin.html")) {
      window.location.href = next || "admin.html";
      return;
    }

    if (next) {
      window.location.href = next;
      return;
    }

    window.location.href = "account.html";
  }

  function initRegisterForm() {
    const form = document.querySelector("[data-auth-register]");
    if (!form) return;

    let messageEl = form.querySelector("[data-auth-message]");
    if (!messageEl) {
      messageEl = document.createElement("p");
      messageEl.className = "login-page__error";
      messageEl.dataset.authMessage = "";
      messageEl.hidden = true;
      messageEl.setAttribute("role", "alert");
      form.appendChild(messageEl);
    }

    function showMessage(text) {
      messageEl.textContent = text;
      messageEl.hidden = !text;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showMessage("");

      const firstName = form["first-name"] ? form["first-name"].value.trim() : "";
      const lastName = form["last-name"] ? form["last-name"].value.trim() : "";
      const email = normalizeLoginEmail(form.email ? form.email.value : "");
      const phone = form.phone ? form.phone.value.trim() : "";
      const password = form.password ? form.password.value : "";
      const passwordConfirm = form["password-confirm"]
        ? form["password-confirm"].value
        : "";

      if (!firstName || !lastName || !email || !phone || !password) {
        showMessage("Заполните все обязательные поля.");
        return;
      }

      const firstNameError = getNameError(firstName, true);
      if (firstNameError) {
        showMessage(firstNameError);
        return;
      }

      const lastNameError = getNameError(lastName, true);
      if (lastNameError) {
        showMessage(lastNameError);
        return;
      }

      const emailError = getEmailError(email, true);
      if (emailError) {
        showMessage(emailError);
        return;
      }

      if (digitsOnly(phone).length < 11) {
        showMessage("Укажите телефон в формате +7 (000) 000 00 - 00.");
        return;
      }

      if (password !== passwordConfirm) {
        showMessage("Пароли не совпадают.");
        return;
      }

      const passwordError = getPasswordError(password);
      if (passwordError) {
        showMessage(passwordError);
        return;
      }

      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            phone,
            password,
          }),
        });

        let data = {};
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          throw new Error(data.error || "Не удалось зарегистрироваться.");
        }

        setAuthSession(data.token, data.user, false);
        window.location.href = "account.html";
      } catch (error) {
        showMessage(error.message || "Не удалось зарегистрироваться.");
      }
    });
  }

  function initSiteHeaderFixed() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    function syncHeaderOffset() {
      document.documentElement.style.setProperty(
        "--site-header-offset",
        `${header.offsetHeight}px`
      );
    }

    syncHeaderOffset();

    window.addEventListener("resize", syncHeaderOffset, { passive: true });

    const toggle = document.getElementById("site-header-nav-toggle");
    if (toggle) {
      toggle.addEventListener("change", function () {
        requestAnimationFrame(syncHeaderOffset);
        window.setTimeout(syncHeaderOffset, 600);
      });
    }
  }

  function initServiceBooking() {
    const modal = document.getElementById("service-booking-modal");
    const form = document.querySelector("[data-service-booking-form]");
    if (!modal || !form) return;

    const serviceNameEl = modal.querySelector("[data-service-booking-service-name]");
    const messageEl = modal.querySelector("[data-service-booking-message]");
    const totalEl = modal.querySelector("[data-service-booking-total]");
    const summaryEl = modal.querySelector(".service-booking-modal__summary");
    const slugInput = form.querySelector('[name="service-slug"]');
    const dateInput = form.querySelector('[name="booking-date"]');
    const hoursInput = form.querySelector('[name="hours"]');
    const guestsInput = form.querySelector('[name="guests"]');
    const phoneWrap = form.querySelector("[data-service-booking-phone-wrap]");
    const phoneInput = form.querySelector('[name="phone"]');
    const nameWrap = form.querySelector("[data-service-booking-name-wrap]");
    const nameInput = form.querySelector('[name="guest-name"]');
    const guestsHintEl = form.querySelector("[data-service-booking-guests-hint]");
    const submitBtn = form.querySelector('[type="submit"]');
    const openTriggers = document.querySelectorAll("[data-service-book]");
    const closeTriggers = modal.querySelectorAll("[data-service-booking-close]");
    let lastFocusedElement = null;
    let currentSlug = "";
    let currentServiceMaxGuests = 10;
    let isDateAvailable = true;

    function getMaxGuests() {
      return currentServiceMaxGuests;
    }

    function calculateServiceTotal(slug, hours) {
      const value = Number(hours) || 1;
      const safeHours = Math.max(1, Math.min(24, Math.floor(value)));

      if (slug === "conference-hall") {
        return safeHours * 720;
      }

      if (slug === "sauna-pool") {
        if (safeHours <= 1) return 1800;
        if (safeHours === 2) return 3600;
        return 3600 + (safeHours - 2) * 1200;
      }

      return 0;
    }

    function formatRubles(amount) {
      return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " рублей";
    }

    function localTodayISO() {
      return localISODate(startOfToday());
    }

    function hideMessage() {
      if (!messageEl) return;
      messageEl.hidden = true;
      messageEl.textContent = "";
      messageEl.classList.remove(
        "service-booking-modal__message--error",
        "service-booking-modal__message--success"
      );
      if (summaryEl) summaryEl.classList.remove("is-unavailable");
    }

    function showMessage(text, isError) {
      if (!messageEl) return;
      messageEl.textContent = text;
      messageEl.hidden = !text;
      messageEl.classList.toggle("service-booking-modal__message--error", Boolean(isError));
      messageEl.classList.toggle("service-booking-modal__message--success", !isError);
      if (summaryEl) summaryEl.classList.toggle("is-unavailable", Boolean(isError));
    }

    function updateTotal() {
      if (!totalEl) return;
      const hours = hoursInput ? hoursInput.value : 1;
      totalEl.textContent = formatRubles(calculateServiceTotal(currentSlug, hours));
    }

    function syncGuestLimits() {
      if (!guestsInput) return;

      const maxGuests = getMaxGuests();
      guestsInput.max = String(maxGuests);

      if (Number(guestsInput.value) > maxGuests) {
        guestsInput.value = String(maxGuests);
      }

      if (guestsHintEl) {
        guestsHintEl.textContent = "Максимум " + maxGuests + " человек";
      }
    }

    function syncContactFields() {
      const user = getAuthUser();
      const needsPhone = !user || !user.phone;
      const needsName = !user || !(user.firstName || user.lastName);

      if (phoneWrap) {
        phoneWrap.hidden = !needsPhone;
      }

      if (phoneInput) {
        phoneInput.required = needsPhone;
        phoneInput.value = user && user.phone ? user.phone : phoneInput.value;
      }

      if (nameWrap) {
        nameWrap.hidden = !needsName;
      }

      if (nameInput) {
        nameInput.required = needsName;
        if (user && (user.firstName || user.lastName)) {
          nameInput.value = (user.firstName + " " + user.lastName).trim();
        }
      }
    }

    function getServiceGuestName() {
      const user = getAuthUser();
      if (user && (user.firstName || user.lastName)) {
        return (user.firstName + " " + user.lastName).trim();
      }
      return nameInput ? nameInput.value.trim() : "";
    }

    function setPayEnabled(enabled) {
      if (submitBtn) submitBtn.disabled = !enabled;
    }

    async function checkAvailability() {
      if (!currentSlug || !dateInput || !dateInput.value) {
        hideMessage();
        isDateAvailable = true;
        setPayEnabled(true);
        return true;
      }

      try {
        const response = await fetch(
          "/api/services/availability?slug=" +
            encodeURIComponent(currentSlug) +
            "&date=" +
            encodeURIComponent(dateInput.value)
        );

        let data = {};
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          showMessage(data.error || "Не удалось проверить доступность.", true);
          isDateAvailable = false;
          setPayEnabled(false);
          return false;
        }

        if (!data.available) {
          showMessage(
            data.message || "Бронирование в этот день невозможно.",
            true
          );
          isDateAvailable = false;
          setPayEnabled(false);
          return false;
        }

        hideMessage();
        isDateAvailable = true;
        setPayEnabled(true);
        return true;
      } catch (error) {
        showMessage("Не удалось проверить доступность. Запустите сервер.", true);
        isDateAvailable = false;
        setPayEnabled(false);
        return false;
      }
    }

    function openModal(trigger) {
      currentSlug = trigger.getAttribute("data-service-book") || "";
      const serviceTitle = trigger.getAttribute("data-service-title") || "Услуга";
      const maxGuestsAttr = Number(trigger.getAttribute("data-service-max-guests"));
      currentServiceMaxGuests =
        Number.isInteger(maxGuestsAttr) && maxGuestsAttr > 0 ? maxGuestsAttr : 10;

      if (slugInput) slugInput.value = currentSlug;
      if (serviceNameEl) serviceNameEl.textContent = serviceTitle;

      hideMessage();
      form.reset();
      if (slugInput) slugInput.value = currentSlug;

      if (dateInput) {
        dateInput.min = localTodayISO();
        dateInput.max = maxBookingDateISO();
        dateInput.value = localTodayISO();
        clampDateInputToRange(dateInput);
      }

      if (hoursInput) hoursInput.value = "1";
      if (guestsInput) guestsInput.value = "1";

      syncGuestLimits();
      syncContactFields();
      updateTotal();

      lastFocusedElement = document.activeElement;
      modal.hidden = false;
      document.body.classList.add("room-payment-modal-open");
      checkAvailability();

      if (dateInput) dateInput.focus();
    }

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove("room-payment-modal-open");
      hideMessage();
      setPayEnabled(true);

      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    }

    openTriggers.forEach(function (trigger) {
      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        openModal(trigger);
      });
    });

    closeTriggers.forEach(function (trigger) {
      trigger.addEventListener("click", closeModal);
    });

    if (dateInput) {
      dateInput.addEventListener("change", checkAvailability);
      dateInput.addEventListener("input", checkAvailability);
    }

    if (hoursInput) {
      hoursInput.addEventListener("input", updateTotal);
      hoursInput.addEventListener("change", updateTotal);
    }

    if (guestsInput) {
      guestsInput.addEventListener("input", function () {
        const maxGuests = getMaxGuests();
        if (Number(guestsInput.value) > maxGuests) {
          guestsInput.value = String(maxGuests);
        }
      });
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      hideMessage();

      const bookingDate = dateInput ? dateInput.value : "";
      const hours = hoursInput ? Number(hoursInput.value) : 0;
      const guests = guestsInput ? Number(guestsInput.value) : 0;
      const guestName = getServiceGuestName();
      const user = getAuthUser();
      const phone =
        user && user.phone
          ? user.phone
          : phoneInput
            ? phoneInput.value.trim()
            : "";

      if (!currentSlug || !bookingDate || !guestName || !phone) {
        showMessage("Заполните все обязательные поля.", true);
        return;
      }

      if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
        showMessage("Укажите количество часов от 1 до 24.", true);
        return;
      }

      const maxGuests = getMaxGuests();
      if (!Number.isInteger(guests) || guests < 1 || guests > maxGuests) {
        showMessage("Укажите количество человек от 1 до " + maxGuests + ".", true);
        return;
      }

      const available = await checkAvailability();
      if (!available || !isDateAvailable) return;

      const demoError = validatePaymentDemo(form);
      if (demoError) {
        showMessage("Подтвердите демонстрационную оплату.", true);
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await fetch("/api/services/bookings", {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify({
            serviceSlug: currentSlug,
            bookingDate: bookingDate,
            guestName: guestName,
            phone: phone,
            email: user ? user.email : "",
            hours: hours,
            guests: guests,
          }),
        });

        let data = {};
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          throw new Error(
            data.message || data.error || (data.errors && data.errors[0]) || "Не удалось забронировать услугу."
          );
        }

        closeModal();
        window.alert(data.message || "Бронирование услуги успешно создано.");
      } catch (error) {
        showMessage(error.message || "Не удалось забронировать услугу.", true);
      } finally {
        if (submitBtn) submitBtn.disabled = !isDateAvailable;
      }
    });

    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !modal.hidden) {
        closeModal();
      }
    });
  }

  function initContactsForm() {
    const form = document.querySelector("[data-contacts-form]");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const email = form.email ? form.email.value.trim() : "";
      if (email) {
        const emailError = getEmailError(email, false);
        if (emailError) {
          window.alert(emailError);
          return;
        }
      }

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const response = await fetch("/api/inquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name ? form.name.value.trim() : "",
            phone: form.phone ? form.phone.value.trim() : "",
            email: form.email ? form.email.value.trim() : "",
            topic: form.topic ? form.topic.value.trim() : "",
            message: form.message ? form.message.value.trim() : "",
          }),
        });

        let data = {};
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          throw new Error(data.error || "Не удалось отправить заявку.");
        }

        form.reset();
        window.alert(data.message || "Заявка отправлена.");
      } catch (error) {
        window.alert(error.message || "Не удалось отправить заявку.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function initPrivacyPolicyLinks() {
    var currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (currentPage === "privacy.html") return;

    document.querySelectorAll('a[href="privacy.html"]').forEach(function (link) {
      link.href = "privacy.html?from=" + encodeURIComponent(currentPage);
    });
  }

  function initAccessibilityLauncher() {
    var currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (currentPage === "accessible.html") return;
    if (document.querySelector("[data-a11y-launcher]")) return;

    var link = document.createElement("a");
    link.href = "accessible.html";
    link.className = "a11y-launcher";
    link.setAttribute("data-a11y-launcher", "");
    link.setAttribute("aria-label", "Версия для слабовидящих");
    link.setAttribute("title", "Версия для слабовидящих");
    link.innerHTML =
      '<svg class="a11y-launcher__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>' +
      "</svg>";

    document.body.appendChild(link);
  }

  async function init() {
    initAccessibilityLauncher();
    initSiteHeaderFixed();
    initPrivacyPolicyLinks();
    await refreshAuthSession();
    initSiteHeaderAuth();
    initFormValidation();
    initLoginForm();
    initForgotPasswordForm();
    await initResetPasswordForm();
    initRegisterForm();
    initContactsForm();
    initServiceBooking();
    initStayRangeForms();
    initGuestLimitInputs();
    initAboutGallery();
    initRoomDetailGallery();
    initReviewsFormStars();
    initReviewsFormSubmit();
    await initReviewsFromApi();
    initReviewsReveal();
    initBookingReveal();
    initRoomPaymentModal();
    initBookingAvailability();
    initRoomTariffSelection();
    initAccountBookingsTabs();

    const accountReady = await initAccountAuthGuard();
    if (accountReady !== false) {
      initAccountLogout();
      initAccountProfile();
      await initAccountPages();
      initAccountSettings();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
