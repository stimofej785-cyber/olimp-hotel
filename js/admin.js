(function () {
  const TOKEN_KEY = "olympAuthToken";
  const USER_KEY = "olympAuthUser";
  const API = "/api/admin";

  const panelSection = document.querySelector("[data-admin-panel]");
  const toastEl = document.querySelector("[data-admin-toast]");
  const statsEl = document.querySelector("[data-admin-stats]");
  const bookingsEl = document.querySelector("[data-admin-bookings]");
  const roomsEl = document.querySelector("[data-admin-rooms]");
  const servicesEl = document.querySelector("[data-admin-services]");
  const reviewsEl = document.querySelector("[data-admin-reviews]");
  const usersEl = document.querySelector("[data-admin-users]");
  const inquiriesEl = document.querySelector("[data-admin-inquiries]");
  const userBookingsModal = document.getElementById("admin-user-bookings-modal");
  const userBookingsBody = document.querySelector("[data-admin-user-bookings]");
  const tabButtons = document.querySelectorAll("[data-admin-tab]");
  const sections = document.querySelectorAll("[data-admin-section]");
  const logoutBtn = document.querySelector("[data-admin-logout]");

  let bookingFilter = "";
  let reviewFilter = "";
  let inquiryFilter = "";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return JSON.parse(raw || "null");
    } catch (error) {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("olympAuthRemember");
  }

  function redirectToLogin() {
    window.location.href = "login.html?next=admin.html";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeImageSrc(url) {
    const value = String(url || "").trim();
    if (!value || /^(javascript|data):/i.test(value)) {
      return "";
    }
    return escapeHtml(value);
  }

  function showToast(text, isError) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.toggle("admin-toast--error", Boolean(isError));
    window.setTimeout(function () {
      toastEl.hidden = true;
    }, 3200);
  }

  async function apiRequest(path, options) {
    const config = options || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, config.headers || {});

    if (getToken()) {
      headers.Authorization = "Bearer " + getToken();
    }

    const response = await fetch(API + path, {
      method: config.method || "GET",
      headers: headers,
      body: config.body ? JSON.stringify(config.body) : undefined,
    });

    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || "Ошибка запроса.");
    }

    return data;
  }

  function statusLabel(type, value) {
    const map = {
      booking: {
        pending: "Новое",
        confirmed: "Подтверждено",
        cancelled: "Отменено",
        completed: "Завершено",
      },
      review: {
        pending: "На модерации",
        approved: "Опубликован",
        rejected: "Отклонён",
      },
      inquiry: {
        new: "Новая",
        in_progress: "В обработке",
        processed: "Обработана",
      },
      user: {
        active: "Активен",
        blocked: "Заблокирован",
        admin: "Администратор",
      },
    };

    return (map[type] && map[type][value]) || "Не указано";
  }

  function roleLabel(role) {
    if (role === "admin") return "Администратор";
    if (role === "user") return "Пользователь";
    return "Не указано";
  }

  function categoryLabel(category) {
    const map = {
      standard: "Стандарт",
      improved: "Улучшенный",
      lux: "Люкс",
      main: "Основная",
      extra: "Дополнительная",
    };
    return map[category] || "Не указано";
  }

  function topicLabel(topic) {
    const map = {
      booking: "Бронирование номера",
      services: "Услуги гостиницы",
      conference: "Конференц-зал",
      other: "Другой вопрос",
    };
    return map[topic] || "Не указано";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function switchTab(tab) {
    tabButtons.forEach(function (btn) {
      btn.classList.toggle("admin-nav__link--active", btn.dataset.adminTab === tab);
    });

    sections.forEach(function (section) {
      section.hidden = section.dataset.adminSection !== tab;
    });

    window.scrollTo(0, 0);

    if (tab === "overview") loadStats();
    if (tab === "bookings") loadBookings();
    if (tab === "rooms") loadRooms();
    if (tab === "services") loadServices();
    if (tab === "reviews") loadReviews();
    if (tab === "users") loadUsers();
    if (tab === "inquiries") loadInquiries();
  }

  function renderStats(stats) {
    if (!statsEl) return;

    const bookings = stats.bookings || { pending: 0, total: 0, confirmed: 0 };
    const inquiries = stats.inquiries || { pending: 0, total: 0 };
    const reviews = stats.reviews || { pending: 0, total: 0, approved: 0 };
    const rooms = stats.rooms || { active: 0, total: 0 };
    const services = stats.services || { active: 0, total: 0 };
    const users = stats.users || { total: 0, blocked: 0 };

    statsEl.innerHTML = `
      <article class="admin-stat-card">
        <p class="admin-stat-card__value">${bookings.pending}</p>
        <p class="admin-stat-card__label">Новых бронирований</p>
        <p class="admin-stat-card__meta">Всего: ${bookings.total}</p>
      </article>
      <article class="admin-stat-card">
        <p class="admin-stat-card__value">${inquiries.pending}</p>
        <p class="admin-stat-card__label">Новых заявок</p>
        <p class="admin-stat-card__meta">Всего: ${inquiries.total}</p>
      </article>
      <article class="admin-stat-card">
        <p class="admin-stat-card__value">${reviews.pending}</p>
        <p class="admin-stat-card__label">Отзывов на модерации</p>
        <p class="admin-stat-card__meta">Опубликовано: ${reviews.approved}</p>
      </article>
      <article class="admin-stat-card">
        <p class="admin-stat-card__value">${rooms.active}</p>
        <p class="admin-stat-card__label">Доступных номеров</p>
        <p class="admin-stat-card__meta">Всего: ${rooms.total}</p>
      </article>
      <article class="admin-stat-card">
        <p class="admin-stat-card__value">${services.active}</p>
        <p class="admin-stat-card__label">Активных услуг</p>
        <p class="admin-stat-card__meta">Всего: ${services.total}</p>
      </article>
      <article class="admin-stat-card">
        <p class="admin-stat-card__value">${users.total}</p>
        <p class="admin-stat-card__label">Пользователей</p>
        <p class="admin-stat-card__meta">Заблокировано: ${users.blocked}</p>
      </article>
    `;
  }

  function renderBookings(bookings) {
    if (!bookingsEl) return;

    if (!bookings.length) {
      bookingsEl.innerHTML = '<p class="admin-empty">Бронирования не найдены.</p>';
      return;
    }

    bookingsEl.innerHTML = bookings
      .map(function (item) {
        return `
          <article class="admin-card" data-id="${item.id}">
            <div class="admin-card__head">
              <h3 class="admin-card__title">${escapeHtml(item.guestName)}</h3>
              <span class="admin-badge admin-badge--${item.status}">${statusLabel("booking", item.status)}</span>
            </div>
            <dl class="admin-card__meta">
              <div><dt>Номер</dt><dd>${escapeHtml(item.roomName)}</dd></div>
              <div><dt>Телефон</dt><dd>${escapeHtml(item.phone)}</dd></div>
              <div><dt>Электронная почта</dt><dd>${escapeHtml(item.email || "—")}</dd></div>
              <div><dt>Заезд / выезд</dt><dd>${escapeHtml(item.checkIn)} — ${escapeHtml(item.checkOut)}</dd></div>
              <div><dt>Гостей</dt><dd>${item.guests}</dd></div>
              <div><dt>Сумма</dt><dd>${item.totalPrice} ₽</dd></div>
            </dl>
            <p class="admin-card__note">${formatDate(item.createdAt)}</p>
            <div class="admin-card__actions">
              <button class="admin-btn admin-btn--primary" type="button" data-action="booking-status" data-id="${item.id}" data-status="confirmed">Подтвердить</button>
              <button class="admin-btn admin-btn--outline" type="button" data-action="booking-status" data-id="${item.id}" data-status="completed">Завершить</button>
              <button class="admin-btn admin-btn--outline" type="button" data-action="booking-status" data-id="${item.id}" data-status="cancelled">Отменить</button>
              <button class="admin-btn admin-btn--danger" type="button" data-action="delete-booking" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderRooms(rooms) {
    if (!roomsEl) return;

    if (!rooms.length) {
      roomsEl.innerHTML = '<p class="admin-empty">Номера не найдены.</p>';
      return;
    }

    roomsEl.innerHTML = rooms
      .map(function (item) {
        return `
          <article class="admin-card admin-card--room" data-id="${item.id}">
            <div class="admin-card__head">
              <h3 class="admin-card__title">${escapeHtml(item.title)}</h3>
              <span class="admin-badge ${item.isVisible && item.isAvailable ? "admin-badge--approved" : "admin-badge--cancelled"}">
                ${item.isVisible ? (item.isAvailable ? "Доступен" : "Недоступен") : "Скрыт"}
              </span>
            </div>
            ${item.imageUrl ? `<img class="admin-card__photo" src="${safeImageSrc(item.imageUrl)}" alt="" />` : ""}
            <dl class="admin-card__meta">
              <div><dt>Категория</dt><dd>${escapeHtml(categoryLabel(item.category))}</dd></div>
              <div><dt>Цена</dt><dd>${item.pricePerNight} ₽ / сутки</dd></div>
              <div><dt>Гостей</dt><dd>${item.maxGuests}</dd></div>
              <div><dt>Всего номеров</dt><dd>
                <input
                  class="admin-card__control admin-card__control--units"
                  type="number"
                  min="0"
                  step="1"
                  data-room-units="${item.id}"
                  value="${item.totalUnits}"
                  aria-label="Количество номеров"
                />
              </dd></div>
              <div><dt>Свободно сегодня</dt><dd>${item.availableToday != null ? item.availableToday : "—"}</dd></div>
              <div><dt>Занято сегодня</dt><dd>${item.occupiedToday != null ? item.occupiedToday : "—"}</dd></div>
              <div><dt>Активных броней</dt><dd>${item.activeBookings}</dd></div>
            </dl>
            <label class="admin-card__field">
              <span>Описание</span>
              <textarea class="admin-card__control" data-room-description="${item.id}" rows="2">${escapeHtml(item.description)}</textarea>
            </label>
            <div class="admin-card__actions">
              <button class="admin-btn admin-btn--primary" type="button" data-action="save-room" data-id="${item.id}">Сохранить</button>
              <button class="admin-btn admin-btn--outline" type="button" data-action="toggle-room-visible" data-id="${item.id}" data-visible="${item.isVisible ? "0" : "1"}">${item.isVisible ? "Скрыть" : "Показать"}</button>
              <button class="admin-btn admin-btn--outline" type="button" data-action="toggle-room-available" data-id="${item.id}" data-available="${item.isAvailable ? "0" : "1"}">${item.isAvailable ? "Недоступен" : "Доступен"}</button>
              <button class="admin-btn admin-btn--danger" type="button" data-action="delete-room" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderServices(services) {
    if (!servicesEl) return;

    if (!services.length) {
      servicesEl.innerHTML = '<p class="admin-empty">Услуги не найдены.</p>';
      return;
    }

    servicesEl.innerHTML = services
      .map(function (item) {
        return `
          <article class="admin-card admin-card--service" data-id="${item.id}">
            <div class="admin-card__head">
              <h3 class="admin-card__title">${escapeHtml(item.title)}</h3>
              <span class="admin-badge ${item.isActive ? "admin-badge--approved" : "admin-badge--cancelled"}">
                ${item.isActive ? "Активна" : "Скрыта"}
              </span>
            </div>
            <dl class="admin-card__meta">
              <div><dt>Цена</dt><dd>${escapeHtml(item.priceText || "—")}</dd></div>
            </dl>
            <label class="admin-card__field">
              <span>Описание</span>
              <textarea class="admin-card__control" data-service-description="${item.id}" rows="2">${escapeHtml(item.description)}</textarea>
            </label>
            <div class="admin-card__actions">
              <button class="admin-btn admin-btn--primary" type="button" data-action="save-service" data-id="${item.id}">Сохранить</button>
              <button class="admin-btn admin-btn--outline" type="button" data-action="toggle-service" data-id="${item.id}" data-active="${item.isActive ? "0" : "1"}">${item.isActive ? "Скрыть" : "Показать"}</button>
              <button class="admin-btn admin-btn--danger" type="button" data-action="delete-service" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderReviews(reviews) {
    if (!reviewsEl) return;

    if (!reviews.length) {
      reviewsEl.innerHTML = '<p class="admin-empty">Отзывы не найдены.</p>';
      return;
    }

    reviewsEl.innerHTML = reviews
      .map(function (item) {
        return `
          <article class="admin-card" data-id="${item.id}">
            <div class="admin-card__head">
              <h3 class="admin-card__title">${escapeHtml(item.authorName)}</h3>
              <span class="admin-badge admin-badge--${item.status}">${statusLabel("review", item.status)}</span>
            </div>
            <p class="admin-card__rating">Оценка: ${item.rating} / 5</p>
            <p class="admin-card__text">${escapeHtml(item.message)}</p>
            <p class="admin-card__note">${escapeHtml(item.roomType || "Номер не указан")} · ${formatDate(item.createdAt)}</p>
            <div class="admin-card__actions">
              <button class="admin-btn admin-btn--primary" type="button" data-action="approve-review" data-id="${item.id}">Опубликовать</button>
              <button class="admin-btn admin-btn--outline" type="button" data-action="reject-review" data-id="${item.id}">Отклонить</button>
              <button class="admin-btn admin-btn--danger" type="button" data-action="delete-review" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderUsers(users) {
    if (!usersEl) return;

    if (!users.length) {
      usersEl.innerHTML = '<p class="admin-empty">Пользователи не найдены.</p>';
      return;
    }

    usersEl.innerHTML = users
      .map(function (item) {
        const badgeClass = item.role === "admin" ? "admin-badge--approved" : item.isBlocked ? "admin-badge--cancelled" : "admin-badge--confirmed";
        const badgeText = item.role === "admin" ? statusLabel("user", "admin") : item.isBlocked ? statusLabel("user", "blocked") : statusLabel("user", "active");

        return `
          <article class="admin-card" data-id="${item.id}">
            <div class="admin-card__head">
              <h3 class="admin-card__title">${escapeHtml(item.firstName)} ${escapeHtml(item.lastName)}</h3>
              <span class="admin-badge ${badgeClass}">${badgeText}</span>
            </div>
            <dl class="admin-card__meta">
              <div><dt>Электронная почта</dt><dd>${escapeHtml(item.email)}</dd></div>
              <div><dt>Телефон</dt><dd>${escapeHtml(item.phone || "—")}</dd></div>
              <div><dt>Роль</dt><dd>${escapeHtml(roleLabel(item.role))}</dd></div>
              <div><dt>Регистрация</dt><dd>${formatDate(item.createdAt)}</dd></div>
              <div><dt>Последний вход</dt><dd>${item.lastLoginAt ? formatDate(item.lastLoginAt) : "—"}</dd></div>
            </dl>
            <div class="admin-card__actions">
              <button class="admin-btn admin-btn--outline" type="button" data-action="user-bookings" data-id="${item.id}">Бронирования</button>
              ${item.role !== "admin" ? `
                <button class="admin-btn ${item.isBlocked ? "admin-btn--primary" : "admin-btn--danger"}" type="button"
                  data-action="toggle-user-block" data-id="${item.id}" data-blocked="${item.isBlocked ? "0" : "1"}">
                  ${item.isBlocked ? "Разблокировать" : "Заблокировать"}
                </button>
              ` : ""}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderInquiries(inquiries) {
    if (!inquiriesEl) return;

    if (!inquiries.length) {
      inquiriesEl.innerHTML = '<p class="admin-empty">Заявки не найдены.</p>';
      return;
    }

    inquiriesEl.innerHTML = inquiries
      .map(function (item) {
        return `
          <article class="admin-card" data-id="${item.id}">
            <div class="admin-card__head">
              <h3 class="admin-card__title">${escapeHtml(item.name)}</h3>
              <span class="admin-badge admin-badge--${item.status === "new" ? "pending" : item.status === "processed" ? "approved" : "confirmed"}">${statusLabel("inquiry", item.status)}</span>
            </div>
            <dl class="admin-card__meta">
              <div><dt>Телефон</dt><dd>${escapeHtml(item.phone || "—")}</dd></div>
              <div><dt>Электронная почта</dt><dd>${escapeHtml(item.email || "—")}</dd></div>
              <div><dt>Тема</dt><dd>${escapeHtml(topicLabel(item.topic))}</dd></div>
              <div><dt>Дата</dt><dd>${formatDate(item.createdAt)}</dd></div>
            </dl>
            <p class="admin-card__text">${escapeHtml(item.message)}</p>
            <div class="admin-card__actions">
              <button class="admin-btn admin-btn--primary" type="button" data-action="inquiry-status" data-id="${item.id}" data-status="in_progress">В обработке</button>
              <button class="admin-btn admin-btn--outline" type="button" data-action="inquiry-status" data-id="${item.id}" data-status="processed">Обработана</button>
              <button class="admin-btn admin-btn--danger" type="button" data-action="delete-inquiry" data-id="${item.id}">Удалить</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderUserBookings(bookings, userName) {
    if (!userBookingsBody) return;

    const title = document.getElementById("admin-user-bookings-title");
    if (title) title.textContent = "Бронирования: " + userName;

    if (!bookings.length) {
      userBookingsBody.innerHTML = '<p class="admin-empty">Бронирования не найдены.</p>';
      return;
    }

    userBookingsBody.innerHTML = bookings
      .map(function (item) {
        return `
          <article class="admin-card admin-card--compact">
            <div class="admin-card__head">
              <h4 class="admin-card__title">${escapeHtml(item.roomName)}</h4>
              <span class="admin-badge admin-badge--${item.status}">${statusLabel("booking", item.status)}</span>
            </div>
            <p class="admin-card__note">${escapeHtml(item.checkIn)} — ${escapeHtml(item.checkOut)} · ${item.totalPrice} ₽</p>
          </article>
        `;
      })
      .join("");
  }

  function openUserBookingsModal() {
    if (!userBookingsModal) return;
    userBookingsModal.hidden = false;
    document.body.classList.add("admin-modal-open");
  }

  function closeUserBookingsModal() {
    if (!userBookingsModal) return;
    userBookingsModal.hidden = true;
    document.body.classList.remove("admin-modal-open");
  }

  async function loadStats() {
    const stats = await apiRequest("/stats");
    renderStats(stats);
  }

  async function loadBookings() {
    const query = bookingFilter ? "?status=" + encodeURIComponent(bookingFilter) : "";
    const data = await apiRequest("/bookings" + query);
    renderBookings(data.bookings || []);
  }

  async function loadRooms() {
    const data = await apiRequest("/rooms");
    renderRooms(data.rooms || []);
  }

  async function loadServices() {
    const data = await apiRequest("/services");
    renderServices(data.services || []);
  }

  async function loadReviews() {
    const query = reviewFilter ? "?status=" + encodeURIComponent(reviewFilter) : "";
    const data = await apiRequest("/reviews" + query);
    renderReviews(data.reviews || []);
  }

  async function loadUsers() {
    const data = await apiRequest("/users");
    renderUsers(data.users || []);
  }

  async function loadInquiries() {
    const query = inquiryFilter ? "?status=" + encodeURIComponent(inquiryFilter) : "";
    const data = await apiRequest("/inquiries" + query);
    renderInquiries(data.inquiries || []);
  }

  function persistSessionUser(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    if (localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  }

  async function initAuth() {
    const token = getToken();

    if (!token) {
      redirectToLogin();
      return;
    }

    try {
      const meResponse = await fetch("/api/auth/me", {
        headers: { Authorization: "Bearer " + token },
      });

      if (!meResponse.ok) {
        clearSession();
        redirectToLogin();
        return;
      }

      const meData = await meResponse.json();

      if (!meData.user || meData.user.role !== "admin") {
        clearSession();
        redirectToLogin();
        return;
      }

      persistSessionUser(token, meData.user);

      if (panelSection) panelSection.hidden = false;

      await loadStats();
      switchTab("overview");
    } catch (error) {
      clearSession();
      redirectToLogin();
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
        });
      } catch (error) {
        /* ignore */
      }

      clearSession();
      redirectToLogin();
    });
  }

  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      switchTab(button.dataset.adminTab);
    });
  });

  document.querySelectorAll("[data-booking-filter]").forEach(function (button) {
    button.addEventListener("click", async function () {
      bookingFilter = button.dataset.bookingFilter || "";
      document.querySelectorAll("[data-booking-filter]").forEach(function (item) {
        item.classList.toggle("admin-filter--active", item === button);
      });
      try {
        await loadBookings();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-review-filter]").forEach(function (button) {
    button.addEventListener("click", async function () {
      reviewFilter = button.dataset.reviewFilter || "";
      document.querySelectorAll("[data-review-filter]").forEach(function (item) {
        item.classList.toggle("admin-filter--active", item === button);
      });
      try {
        await loadReviews();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-inquiry-filter]").forEach(function (button) {
    button.addEventListener("click", async function () {
      inquiryFilter = button.dataset.inquiryFilter || "";
      document.querySelectorAll("[data-inquiry-filter]").forEach(function (item) {
        item.classList.toggle("admin-filter--active", item === button);
      });
      try {
        await loadInquiries();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  if (bookingsEl) {
    bookingsEl.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      try {
        if (action === "booking-status") {
          await apiRequest("/bookings/" + id, { method: "PATCH", body: { status: button.dataset.status } });
        } else if (action === "delete-booking") {
          if (!window.confirm("Удалить бронирование?")) return;
          await apiRequest("/bookings/" + id, { method: "DELETE" });
        }

        showToast("Бронирование обновлено.");
        await loadBookings();
        await loadStats();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (roomsEl) {
    roomsEl.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      try {
        if (action === "save-room") {
          const textarea = roomsEl.querySelector('[data-room-description="' + id + '"]');
          const unitsInput = roomsEl.querySelector('[data-room-units="' + id + '"]');
          const totalUnits = unitsInput ? Number(unitsInput.value) : undefined;
          const body = { description: textarea ? textarea.value : "" };

          if (!Number.isInteger(totalUnits) || totalUnits < 0) {
            throw new Error("Укажите количество номеров (целое число от 0).");
          }

          body.totalUnits = totalUnits;

          await apiRequest("/rooms/" + id, {
            method: "PATCH",
            body: body,
          });
        } else if (action === "toggle-room-visible") {
          await apiRequest("/rooms/" + id, { method: "PATCH", body: { isVisible: button.dataset.visible === "1" } });
        } else if (action === "toggle-room-available") {
          await apiRequest("/rooms/" + id, { method: "PATCH", body: { isAvailable: button.dataset.available === "1" } });
        } else if (action === "delete-room") {
          if (!window.confirm("Удалить номер?")) return;
          await apiRequest("/rooms/" + id, { method: "DELETE" });
        }

        showToast("Номер обновлён.");
        await loadRooms();
        await loadStats();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (servicesEl) {
    servicesEl.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      try {
        if (action === "save-service") {
          const textarea = servicesEl.querySelector('[data-service-description="' + id + '"]');
          await apiRequest("/services/" + id, {
            method: "PATCH",
            body: { description: textarea ? textarea.value : "" },
          });
        } else if (action === "toggle-service") {
          await apiRequest("/services/" + id, {
            method: "PATCH",
            body: { isActive: button.dataset.active === "1" },
          });
        } else if (action === "delete-service") {
          if (!window.confirm("Удалить услугу?")) return;
          await apiRequest("/services/" + id, { method: "DELETE" });
        }

        showToast("Услуга обновлена.");
        await loadServices();
        await loadStats();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (reviewsEl) {
    reviewsEl.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      try {
        if (action === "approve-review") {
          await apiRequest("/reviews/" + id, { method: "PATCH", body: { status: "approved" } });
        } else if (action === "reject-review") {
          await apiRequest("/reviews/" + id, { method: "PATCH", body: { status: "rejected" } });
        } else if (action === "delete-review") {
          if (!window.confirm("Удалить отзыв?")) return;
          await apiRequest("/reviews/" + id, { method: "DELETE" });
        }

        showToast("Отзыв обновлён.");
        await loadReviews();
        await loadStats();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (usersEl) {
    usersEl.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;
      const card = button.closest(".admin-card");
      const userName = card ? card.querySelector(".admin-card__title").textContent : "";

      try {
        if (action === "user-bookings") {
          const data = await apiRequest("/users/" + id + "/bookings");
          renderUserBookings(data.bookings || [], userName);
          openUserBookingsModal();
          return;
        }

        if (action === "toggle-user-block") {
          await apiRequest("/users/" + id, {
            method: "PATCH",
            body: { isBlocked: button.dataset.blocked === "1" },
          });
        }

        showToast("Пользователь обновлён.");
        await loadUsers();
        await loadStats();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  if (inquiriesEl) {
    inquiriesEl.addEventListener("click", async function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      try {
        if (action === "inquiry-status") {
          await apiRequest("/inquiries/" + id, { method: "PATCH", body: { status: button.dataset.status } });
        } else if (action === "delete-inquiry") {
          if (!window.confirm("Удалить заявку?")) return;
          await apiRequest("/inquiries/" + id, { method: "DELETE" });
        }

        showToast("Заявка обновлена.");
        await loadInquiries();
        await loadStats();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  document.querySelectorAll("[data-admin-modal-close]").forEach(function (button) {
    button.addEventListener("click", closeUserBookingsModal);
  });

  if (userBookingsModal) {
    userBookingsModal.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !userBookingsModal.hidden) {
        closeUserBookingsModal();
      }
    });
  }

  initAuth();
})();
