
"use strict";

/* =========================================
   1. CONFIGURATION
========================================= */

const STORAGE_KEY = "QServe_data";
const ACCOUNTS_KEY = "QServe_accounts";
const SESSION_KEY = "QServe_session";
const SETTINGS_KEY = "OralCareConnect_settings";
const LOCKOUT_KEY = "OralCareConnect_loginAttempts";
const LOGS_KEY = "OralCareConnect_logs";

const firebaseConfig = {
    apiKey: "AIzaSyCG3CIquWNYHQQaLLZA0Se24Poaz3dfdfY",
    authDomain: "dentalclinicappointmentapp.firebaseapp.com",
    projectId: "dentalclinicappointmentapp",
    storageBucket: "dentalclinicappointmentapp.firebasestorage.app",
    messagingSenderId: "280620205827",
    appId: "1:280620205827:web:dentalclinicappointmentapp"
};

let auth = null;
let db = null;
let isFirebaseAvailable = false;

try {
    if (typeof firebase !== "undefined") {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

        auth = firebase.auth();
        db = firebase.firestore();
        isFirebaseAvailable = true;
    }
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

const ADMIN_ACCOUNT = {
    name: "System Administrator",
    email: "admin@qserve.com",
    password: "Admin123",
    role: "admin"
};

const defaultAppointments = [
    {
        id: "1",
        userId: "",
        patientName: "Alex Johnson",
        name: "Alex Johnson",
        email: "",
        service: "Check-up",
        dentist: "John Benedict Centeno",
        date: "2026-11-02",
        time: "09:00",
        status: "Approved",
        queueNumber: 1,
        queue: "Q-001"
    },
    {
        id: "2",
        userId: "",
        patientName: "Maria Santos",
        name: "Maria Santos",
        email: "",
        service: "Cleaning",
        dentist: "Clemence Valdez",
        date: "2026-11-02",
        time: "10:00",
        status: "Pending",
        queueNumber: 0,
        queue: null
    },
    {
        id: "3",
        userId: "",
        patientName: "John Reyes",
        name: "John Reyes",
        email: "",
        service: "Filling",
        dentist: "John Benedict Centeno",
        date: "2026-11-02",
        time: "11:00",
        status: "Approved",
        queueNumber: 2,
        queue: "Q-002"
    }
];

const defaultServices = [
    {
        name: "General Dental Consultation",
        description: "General dental consultation and oral health assessment."
    },
    {
        name: "Dental Cleaning",
        description: "Professional cleaning to help maintain good oral hygiene."
    },
    {
        name: "Tooth Extraction",
        description: "Consultation and care for teeth that may need removal."
    },
    {
        name: "Tooth Filling",
        description: "Dental restoration consultation for damaged or decayed teeth."
    },
    {
        name: "Teeth Whitening",
        description: "Consultation for professional teeth whitening services."
    },
    {
        name: "Root Canal Consultation",
        description: "Assessment and consultation for possible root canal treatment."
    },
    {
        name: "Braces Consultation",
        description: "Consultation about braces and orthodontic treatment."
    },
    {
        name: "Denture Consultation",
        description: "Consultation about denture options and fitting."
    },
    {
        name: "Gum Treatment Consultation",
        description: "Assessment and consultation for gum health concerns."
    },
    {
        name: "Emergency Dental Assessment",
        description: "Priority assessment for urgent dental concerns."
    }
];

const defaultDentists = [
    {
        id: 1,
        name: "Praswel Jim Dimaano",
        specialty: "General Dentistry",
        bio: "Available for general dental appointments and consultations.",
        photo: "./Assets/Dentists/Praswel.jpg"
    },
    {
        id: 2,
        name: "Clemence Valdez",
        specialty: "Dental Surgery",
        bio: "Available for dental appointments and patient consultations.",
        photo: "./Assets/Dentists/Clemence.jpg"
    },
    {
        id: 3,
        name: "John Benedict Centeno",
        specialty: "Orthodontics",
        bio: "Available for dental appointments and patient consultations.",
        photo: "./Assets/Dentists/Benedict.jpg"
    }
];

let appointments = [];
let services = [];
let dentists = [];
let notifications = [];
let queue = [];
let activityLogs = [];

let currentQueue = "Q-000";
let nextQueueNumber = 3;
let currentUser = null;
let lockoutInterval = null;
let activityLogUnsubscribe = null;
let appointmentUnsubscribe = null;


/* =========================================
   2. GENERAL HELPERS
========================================= */

function normalizeStatus(status) {
    if (!status) return "Pending";

    const value = String(status).trim().toLowerCase();

    const statuses = {
        pending: "Pending",
        approved: "Approved",
        confirmed: "Approved",
        serving: "Serving",
        completed: "Completed",
        done: "Completed",
        cancelled: "Cancelled",
        canceled: "Cancelled",
        rejected: "Rejected",
        "cancellation requested": "Cancellation Requested"
    };

    return statuses[value] ||
        value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function getToday() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function formatDate(value) {
    if (!value) return "";

    const parts = value.split("-");
    if (parts.length !== 3) return value;

    return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function fullName(first, middle, last) {
    return [first, middle, last]
        .map(value => String(value || "").trim())
        .filter(Boolean)
        .join(" ");
}

function splitName(name) {
    const parts = String(name || "").trim().split(/\s+/);

    if (parts.length === 1) {
        return { firstName: parts[0], middleName: "", lastName: "" };
    }

    if (parts.length === 2) {
        return { firstName: parts[0], middleName: "", lastName: parts[1] };
    }

    return {
        firstName: parts[0],
        middleName: parts.slice(1, -1).join(" "),
        lastName: parts[parts.length - 1]
    };
}

function isValidPhone(phone) {
    return /^\d{11}$/.test(String(phone || ""));
}

function isValidAge(age) {
    const value = Number(age);
    return Number.isInteger(value) && value >= 1 && value <= 120;
}


/* =========================================
   3. STORAGE
========================================= */

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        appointments,
        services,
        dentists,
        notifications,
        queue,
        currentQueue,
        nextQueueNumber
    }));
}

function getAccounts() {
    try {
        const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY));
        return Array.isArray(accounts) ? accounts : [];
    } catch {
        return [];
    }
}

function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function getSession() {
    try {
        return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch {
        return null;
    }
}

function saveSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        uid: user.uid || "",
        name: user.name,
        email: user.email,
        role: user.role,
        firstName: user.firstName || "",
        middleName: user.middleName || "",
        lastName: user.lastName || "",
        phone: user.phone || "",
        age: user.age || "",
        gender: user.gender || "",
        bookingBlockedUntil: user.bookingBlockedUntil || null
    }));
}

function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
}

function loadData() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

        if (!saved) {
            appointments = defaultAppointments.map(a => ({ ...a }));
            services = defaultServices.map(s => ({ ...s }));
            dentists = defaultDentists.map(d => ({ ...d }));

            notifications = [{
                id: "system-start",
                message: "OralCare Connect system initialized.",
                time: new Date().toLocaleString(),
                read: false
            }];

            currentQueue = "Q-000";
            nextQueueNumber = 3;
        } else {
            appointments = Array.isArray(saved.appointments)
                ? saved.appointments : [];

            const savedServices = Array.isArray(saved.services)
                ? saved.services : [];

            services = defaultServices.map(service => {
                const existing = savedServices.find(
                    item => item.name?.toLowerCase() === service.name.toLowerCase()
                );

                return existing
                    ? { ...service, ...existing }
                    : { ...service };
            });

            savedServices.forEach(service => {
                if (!services.some(
                    item => item.name?.toLowerCase() === service.name?.toLowerCase()
                )) {
                    services.push(service);
                }
            });

            const savedDentists = Array.isArray(saved.dentists)
                ? saved.dentists : [];

            dentists = defaultDentists.map(defaultDentist => {
                const old = savedDentists.find(
                    d => Number(d.id) === Number(defaultDentist.id)
                );

                return {
                    ...defaultDentist,
                    ...(old || {}),
                    photo: defaultDentist.photo
                };
            }).concat(
                savedDentists
                    .filter(d => !defaultDentists.some(
                        base => Number(base.id) === Number(d.id)
                    ))
                    .map(d => ({
                        bio: "Available for dental appointments and consultations.",
                        photo: "",
                        ...d
                    }))
            );

            notifications = Array.isArray(saved.notifications)
                ? saved.notifications : [];

            notifications = notifications.map((item, index) => ({
                id: item.id || `legacy-${index}`,
                read: Boolean(item.read),
                ...item
            }));

            currentQueue = saved.currentQueue || "Q-000";
            nextQueueNumber = Number(saved.nextQueueNumber) || 3;

            appointments.forEach(a => {
                a.patientName = a.patientName || a.name || "Patient";
                a.name = a.name || a.patientName;
                a.status = normalizeStatus(a.status);
                a.queueNumber = Number(a.queueNumber) || 0;
                a.pendingReschedule = a.pendingReschedule || null;
            });
        }

        rebuildQueueFromAppointments();
        saveData();

    } catch (error) {
        console.error("Could not load application data:", error);

        appointments = defaultAppointments.map(a => ({ ...a }));
        services = defaultServices.map(s => ({ ...s }));
        dentists = defaultDentists.map(d => ({ ...d }));
        notifications = [];

        currentQueue = "Q-000";
        nextQueueNumber = 3;

        rebuildQueueFromAppointments();
        saveData();
    }
}


/* =========================================
   4. QUEUE
========================================= */

function rebuildQueueFromAppointments() {
    queue = [];

    let serving = "Q-000";

    const sorted = [...appointments].sort((a, b) =>
        (Number(a.queueNumber) || 0) - (Number(b.queueNumber) || 0)
    );

    sorted.forEach(a => {
        const status = normalizeStatus(a.status);
        const number = Number(a.queueNumber) || 0;

        if (number > 0 && ["Approved", "Serving"].includes(status)) {
            const queueLabel = `Q-${String(number).padStart(3, "0")}`;

            if (status === "Serving") serving = queueLabel;

            queue.push({
                number: queueLabel,
                queueNumber: number,
                name: a.patientName || a.name || "Patient",
                email: a.email || "",
                status: status === "Serving" ? "Serving" : "Waiting",
                appointmentId: a.id
            });
        }
    });

    currentQueue = serving;
}

function renderQueue() {
    const waiting = queue.filter(q => q.status === "Waiting").length;

    document.getElementById("currentQueue").textContent = currentQueue;
    document.getElementById("queueCurrent").textContent = currentQueue;
    document.getElementById("waitingQueue").textContent = waiting;
    document.getElementById("queueWaiting").textContent = waiting;

    const container = document.getElementById("queueTable");

    if (!queue.length) {
        container.innerHTML =
            '<div class="empty-state">No customers in the queue.</div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Queue Number</th>
                    <th>Customer</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${queue.map(q => `
                    <tr>
                        <td><strong>${escapeHTML(q.number)}</strong></td>
                        <td>${escapeHTML(q.name)}</td>
                        <td>
                            <span class="status status-${q.status.toLowerCase()}">
                                ${escapeHTML(q.status)}
                            </span>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

async function callNext() {
    const nextItem = queue.find(q => q.status === "Waiting");

    if (!nextItem) {
        alert("There are no waiting customers.");
        return;
    }

    const previousItem = queue.find(q => q.status === "Serving");

    if (isFirebaseAvailable && db) {
        try {
            const batch = db.batch();

            if (previousItem) {
                batch.update(
                    db.collection("appointments").doc(String(previousItem.appointmentId)),
                    { status: "completed", queueNumber: 0 }
                );
            }

            batch.update(
                db.collection("appointments").doc(String(nextItem.appointmentId)),
                { status: "serving" }
            );

            await batch.commit();

        } catch (error) {
            console.error("Queue update failed:", error);
            alert("The queue could not be updated. Please try again.");
            return;
        }
    } else {
        if (previousItem) {
            const previousAppointment = appointments.find(
                a => String(a.id) === String(previousItem.appointmentId)
            );

            if (previousAppointment) {
                previousAppointment.status = "Completed";
                previousAppointment.queueNumber = 0;
            }
        }

        const nextAppointment = appointments.find(
            a => String(a.id) === String(nextItem.appointmentId)
        );

        if (nextAppointment) nextAppointment.status = "Serving";

        rebuildQueueFromAppointments();
        saveData();
        renderAll();
    }

    addNotification(`Now serving ${nextItem.number} - ${nextItem.name}.`);

    await recordActivity(
        "Queue",
        `Called next customer: ${nextItem.name} (${nextItem.number}).`
    );

    renderAll();
}


/* =========================================
   5. FIRESTORE REALTIME SYNC
========================================= */

function initFirestoreSync() {
    if (!isFirebaseAvailable || !db) return;

    if (appointmentUnsubscribe) appointmentUnsubscribe();

    appointmentUnsubscribe = db.collection("appointments").onSnapshot(
        snapshot => {
            appointments = snapshot.docs.map(doc => {
                const data = doc.data();
                const name = data.patientName || data.name || "Patient";
                const queueNumber = Number(data.queueNumber) || 0;

                return {
                    ...data,
                    id: doc.id,
                    patientName: name,
                    name,
                    status: normalizeStatus(data.status),
                    queueNumber,
                    queue: queueNumber
                        ? `Q-${String(queueNumber).padStart(3, "0")}`
                        : null,
                    pendingReschedule: data.pendingReschedule || null
                };
            });

            const maxQueue = appointments.reduce(
                (max, a) => Math.max(max, Number(a.queueNumber) || 0),
                0
            );

            nextQueueNumber = Math.max(nextQueueNumber, maxQueue + 1);

            rebuildQueueFromAppointments();
            saveData();
            renderAll();

        },
        error => console.error("Appointment sync error:", error)
    );
}


/* =========================================
   6. NOTIFICATIONS
========================================= */

function addNotification(message) {
    notifications.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message,
        time: new Date().toLocaleString(),
        read: false
    });

    notifications = notifications.slice(0, 50);

    saveData();
}

function toggleNotificationRead(id) {
    const item = notifications.find(n => String(n.id) === String(id));
    if (!item) return;

    item.read = !item.read;
    saveData();
    renderNotifications();
}

function deleteNotification(id) {
    notifications = notifications.filter(n => String(n.id) !== String(id));
    saveData();
    renderNotifications();
}

function renderNotifications() {
    const container = document.getElementById("notificationList");

    if (!container) return;

    if (!notifications.length) {
        container.innerHTML =
            '<div class="empty-state">No notifications available.</div>';
        return;
    }

    container.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? "" : "unread"}">
            <div class="notification-content">
                <h4>${escapeHTML(n.message)}</h4>
                <small>${escapeHTML(n.time)}</small>
            </div>
            <div class="notification-actions">
                <button class="btn btn-light"
                    onclick="toggleNotificationRead('${escapeHTML(n.id)}')">
                    ${n.read ? "Mark unread" : "Mark read"}
                </button>
                <button class="btn btn-danger"
                    onclick="deleteNotification('${escapeHTML(n.id)}')">
                    Delete
                </button>
            </div>
        </div>
    `).join("");
}


/* =========================================
   7. ACTIVITY LOGS
========================================= */

function loadActivityLogs() {
    try {
        const saved = JSON.parse(localStorage.getItem(LOGS_KEY));
        activityLogs = Array.isArray(saved) ? saved : [];
    } catch {
        activityLogs = [];
    }
}

async function recordActivity(category, description) {
    const log = {
        category,
        description,
        user: currentUser?.name || "System",
        email: currentUser?.email || "",
        role: currentUser?.role || "system",
        timestamp: new Date().toISOString()
    };

    activityLogs.unshift({
        id: `${Date.now()}-${Math.random()}`,
        ...log
    });

    activityLogs = activityLogs.slice(0, 100);
    localStorage.setItem(LOGS_KEY, JSON.stringify(activityLogs));

    if (isFirebaseAvailable && db) {
        try {
            await db.collection("activityLogs").add(log);
        } catch (error) {
            console.error("Could not save activity log to Firestore:", error);
        }
    }

    renderActivityLogs();
}

function initActivityLogSync() {
    if (!isFirebaseAvailable || !db) return;

    if (activityLogUnsubscribe) activityLogUnsubscribe();

    activityLogUnsubscribe = db.collection("activityLogs")
        .orderBy("timestamp", "desc")
        .limit(100)
        .onSnapshot(snapshot => {
            activityLogs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            localStorage.setItem(LOGS_KEY, JSON.stringify(activityLogs));
            renderActivityLogs();

        }, error => {
            console.error("Activity log sync error:", error);
        });
}

function renderActivityLogs() {
    const container = document.getElementById("activityLogList");
    if (!container) return;

    if (!activityLogs.length) {
        container.innerHTML =
            '<div class="empty-state">No activity records available.</div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date and Time</th>
                    <th>User</th>
                    <th>Category</th>
                    <th>Activity</th>
                </tr>
            </thead>
            <tbody>
                ${activityLogs.map(log => `
                    <tr>
                        <td>${escapeHTML(new Date(log.timestamp).toLocaleString())}</td>
                        <td>
                            ${escapeHTML(log.user || "System")}
                            <br>
                            <small class="activity-meta">${escapeHTML(log.email || "")}</small>
                        </td>
                        <td>${escapeHTML(log.category)}</td>
                        <td class="activity-description">${escapeHTML(log.description)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}


/* =========================================
   8. PASSWORD VISIBILITY
========================================= */

document.addEventListener("click", event => {
    const button = event.target.closest(".password-toggle[data-target]");
    if (!button) return;

    const input = document.getElementById(button.dataset.target);
    if (!input) return;

    const show = input.type === "password";

    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    button.setAttribute("aria-pressed", String(show));
});


/* =========================================
   9. PASSWORD STRENGTH
========================================= */

function getPasswordStrength(password) {
    if (!password) return 0;

    let score = 0;

    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return score;
}

function updatePasswordStrength() {
    const input = document.getElementById("signupPassword");
    const wrapper = document.getElementById("passwordStrength");
    const text = document.getElementById("strengthText");

    if (!input || !wrapper || !text) return;

    const password = input.value;
    const score = getPasswordStrength(password);

    wrapper.classList.remove("weak", "medium", "strong");

    if (!password) {
        text.textContent = "Password strength: Not entered";
    } else if (score <= 1) {
        wrapper.classList.add("weak");
        text.textContent = "Password strength: Weak";
    } else if (score <= 2) {
        wrapper.classList.add("medium");
        text.textContent = "Password strength: Medium";
    } else {
        wrapper.classList.add("strong");
        text.textContent = "Password strength: Strong";
    }
}

const signupPasswordInput = document.getElementById("signupPassword");

if (signupPasswordInput) {
    signupPasswordInput.addEventListener("input", updatePasswordStrength);
}


/* =========================================
   10. LOGIN LOCKOUT
========================================= */

function getLockoutData() {
    try {
        return JSON.parse(localStorage.getItem(LOCKOUT_KEY)) || {
            attempts: 0,
            lockouts: 0,
            lockedUntil: 0
        };
    } catch {
        return { attempts: 0, lockouts: 0, lockedUntil: 0 };
    }
}

function saveLockoutData(data) {
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
}

function getRemainingLockout() {
    const data = getLockoutData();

    return Math.max(0, Math.ceil(
        (Number(data.lockedUntil) - Date.now()) / 1000
    ));
}

function updateLockoutDisplay() {
    const message = document.getElementById("loginLockoutMessage");
    const button = document.getElementById("loginSubmitBtn");

    if (!message || !button) return;

    const remaining = getRemainingLockout();

    if (remaining > 0) {
        button.disabled = true;
        message.textContent =
            `Too many failed attempts. Try again in ${remaining} seconds.`;
    } else {
        button.disabled = false;
        message.textContent = "";

        if (lockoutInterval) {
            clearInterval(lockoutInterval);
            lockoutInterval = null;
        }
    }
}

function startLockoutTimer() {
    updateLockoutDisplay();

    if (lockoutInterval) clearInterval(lockoutInterval);

    lockoutInterval = setInterval(updateLockoutDisplay, 1000);
}

function registerFailedLogin() {
    const data = getLockoutData();

    data.attempts++;

    if (data.attempts >= 3) {
        data.lockouts++;

        const duration = Math.min(
            30 * Math.pow(2, data.lockouts - 1),
            300
        );

        data.lockedUntil = Date.now() + duration * 1000;
        data.attempts = 0;
    }

    saveLockoutData(data);
    startLockoutTimer();
}

function clearFailedLogins() {
    saveLockoutData({
        attempts: 0,
        lockouts: 0,
        lockedUntil: 0
    });

    updateLockoutDisplay();
}


/* =========================================
   11. AUTHENTICATION
========================================= */

function showAuthView(view) {
    document.getElementById("loginView").hidden = view !== "login";
    document.getElementById("signupView").hidden = view !== "signup";

    document.getElementById("loginError").textContent = "";
    document.getElementById("signupError").textContent = "";

    updateLockoutDisplay();
}

/* FORGOT PASSWORD */

async function forgotPassword() {
    const emailInput = document.getElementById("loginEmail");
    const error = document.getElementById("loginError");
    const email = emailInput?.value.trim().toLowerCase();

    if (!email) {
        error.textContent = "Please enter your registered email address first.";
        emailInput?.focus();
        return;
    }

    if (!isFirebaseAvailable || !auth) {
        error.textContent =
            "Password reset is currently unavailable. Please check your Firebase connection.";
        return;
    }

    error.textContent = "Sending password reset email...";

    try {
        await auth.sendPasswordResetEmail(email);

        error.textContent =
            "Password reset email sent! Please check your inbox and spam folder.";

    } catch (firebaseError) {
        console.error("Password reset error:", firebaseError);

        if (firebaseError.code === "auth/user-not-found") {
            error.textContent = "No registered account was found for this email.";
        } else if (firebaseError.code === "auth/invalid-email") {
            error.textContent = "Please enter a valid email address.";
        } else if (firebaseError.code === "auth/too-many-requests") {
            error.textContent = "Too many attempts. Please try again later.";
        } else if (firebaseError.code === "auth/network-request-failed") {
            error.textContent = "Network error. Please check your internet connection.";
        } else {
            error.textContent =
                "Unable to send the reset email. Please try again.";
        }
    }
}

/* LOGIN */

function loginUser(user) {
    currentUser = {
        uid: user.uid || "",
        name: user.name || user.displayName || "Customer",
        email: user.email || "",
        role: user.role || "customer",
        firstName: user.firstName || "",
        middleName: user.middleName || "",
        lastName: user.lastName || "",
        phone: user.phone || "",
        age: user.age || "",
        gender: user.gender || "",
        bookingBlockedUntil: user.bookingBlockedUntil || null
    };

    saveSession(currentUser);
    document.getElementById("authSection").hidden = true;

    if (currentUser.role === "admin") {
        openAdminPortal();
    } else {
        openCustomerPortal();
    }
}

async function getFirebaseUserProfile(user) {
    const fallback = {
        name: user.displayName || user.email.split("@")[0],
        email: user.email,
        role: "customer"
    };

    if (!db) return fallback;

    try {
        const snapshot = await db.collection("users").doc(user.uid).get();

        if (snapshot.exists) {
            return { ...fallback, ...snapshot.data() };
        }
    } catch (error) {
        console.warn("Could not load user profile:", error);
    }

    return fallback;
}

document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    const error = document.getElementById("loginError");

    error.textContent = "";

    if (getRemainingLockout() > 0) {
        updateLockoutDisplay();
        return;
    }

    if (
        email === ADMIN_ACCOUNT.email.toLowerCase() &&
        password === ADMIN_ACCOUNT.password
    ) {
        clearFailedLogins();
        loginUser(ADMIN_ACCOUNT);
        return;
    }

    if (isFirebaseAvailable && auth) {
        try {
            const credential = await auth.signInWithEmailAndPassword(email, password);
            const profile = await getFirebaseUserProfile(credential.user);

            clearFailedLogins();

            loginUser({
                uid: credential.user.uid,
                ...profile,
                email: credential.user.email
            });

            return;

        } catch (firebaseError) {
            console.warn("Firebase login failed:", firebaseError.code);
        }
    }

    const localAccount = getAccounts().find(account =>
        String(account.email || "").toLowerCase() === email &&
        account.password === password
    );

    if (localAccount) {
        clearFailedLogins();
        loginUser(localAccount);
        return;
    }

    registerFailedLogin();
    error.textContent = "Invalid email address or password.";
});

/* FORGOT PASSWORD BUTTON LISTENER */

const forgotPasswordButton = document.getElementById("forgotPasswordBtn");

if (forgotPasswordButton) {
    forgotPasswordButton.addEventListener("click", forgotPassword);
}


/* =========================================
   12. SIGNUP
========================================= */

document.getElementById("signupForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const firstName = document.getElementById("signupFirstName").value.trim();
        const middleName = document.getElementById("signupMiddleName").value.trim();
        const lastName = document.getElementById("signupLastName").value.trim();
        const name = fullName(firstName, middleName, lastName);

        const email = document.getElementById("signupEmail").value.trim().toLowerCase();
        const phone = document.getElementById("signupPhone").value.trim();
        const age = document.getElementById("signupAge").value;
        const gender = document.getElementById("signupGender").value;

        const password = document.getElementById("signupPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const error = document.getElementById("signupError");

        error.textContent = "";

        if (!firstName || !lastName || !email) {
            error.textContent = "Please complete your required personal information.";
            return;
        }

        if (!isValidPhone(phone)) {
            error.textContent = "Phone number must contain exactly 11 digits.";
            return;
        }

        if (!isValidAge(age)) {
            error.textContent = "Please enter a valid age.";
            return;
        }

        if (!gender) {
            error.textContent = "Please select your gender.";
            return;
        }

        if (password.length < 8) {
            error.textContent = "Password must contain at least 8 characters.";
            return;
        }

        if (getPasswordStrength(password) < 2) {
            error.textContent =
                "Please use a stronger password with a mix of letters, numbers, or symbols.";
            return;
        }

        if (password !== confirmPassword) {
            error.textContent = "Passwords do not match.";
            return;
        }

        if (email === ADMIN_ACCOUNT.email.toLowerCase()) {
            error.textContent = "This email address cannot be used.";
            return;
        }

        if (!isFirebaseAvailable || !auth || !db) {
            error.textContent =
                "Firebase is not connected. Please check your Firebase configuration before creating an account.";
            return;
        }

        try {
            const credential = await auth.createUserWithEmailAndPassword(email, password);
            const user = credential.user;

            await user.updateProfile({ displayName: name });

            const profile = {
                uid: user.uid,
                firstName,
                middleName,
                lastName,
                name,
                email,
                phone,
                age: Number(age),
                gender,
                role: "customer",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection("users").doc(user.uid).set(profile);

            await recordActivity(
                "Account",
                `A customer account was registered: ${name}.`
            );

            alert("Account created successfully. You can now log in.");

            this.reset();
            updatePasswordStrength();

            document.getElementById("loginEmail").value = email;
            showAuthView("login");

        } catch (signupError) {
            console.error("Signup failed:", signupError);

            if (signupError.code === "auth/email-already-in-use") {
                error.textContent = "An account with this email already exists.";
            } else if (signupError.code === "auth/weak-password") {
                error.textContent = "Please choose a stronger password.";
            } else if (signupError.code === "auth/invalid-email") {
                error.textContent = "Please enter a valid email address.";
            } else {
                error.textContent =
                    "Account creation failed. Please check your connection and try again.";
            }
        }
    }
);


/* =========================================
   13. LOGOUT
========================================= */

async function logout() {
    if (currentUser) {
        await recordActivity("Account", `${currentUser.name} logged out.`);
    }

    currentUser = null;
    clearSession();

    if (isFirebaseAvailable && auth) {
        try {
            await auth.signOut();
        } catch (error) {
            console.warn("Firebase sign-out error:", error);
        }
    }

    document.getElementById("adminApp").hidden = true;
    document.getElementById("customerApp").hidden = true;
    document.getElementById("authSection").hidden = false;

    document.getElementById("loginForm").reset();
    document.getElementById("signupForm").reset();

    showAuthView("login");
}


/* =========================================
   14. PORTAL INITIALIZATION
========================================= */

function openAdminPortal() {
    document.getElementById("customerApp").hidden = true;
    document.getElementById("adminApp").hidden = false;

    document.getElementById("adminName").textContent = currentUser.name;

    document.querySelector("#adminApp .avatar").textContent =
        currentUser.name.charAt(0).toUpperCase();

    showPage("dashboard");
    renderAll();
}

function openCustomerPortal() {
    document.getElementById("adminApp").hidden = true;
    document.getElementById("customerApp").hidden = false;

    document.getElementById("customerHeaderName").textContent = currentUser.name;
    document.getElementById("customerSidebarName").textContent = currentUser.name;

    document.getElementById("customerAvatar").textContent =
        currentUser.name.charAt(0).toUpperCase();

    document.getElementById("customerWelcome").textContent =
        `Welcome, ${currentUser.name}!`;

    fillProfileForm();
    showCustomerPage("customerDashboard");
    renderAll();
}


/* =========================================
   15. ADMIN NAVIGATION
========================================= */

function showPage(page, button) {
    const target = document.getElementById(page);
    if (!target) return;

    document.querySelectorAll("#adminApp .page").forEach(section => {
        section.classList.remove("active");
    });

    target.classList.add("active");

    document.querySelectorAll("#adminApp .nav-item").forEach(item => {
        item.classList.remove("active");
    });

    if (button) {
        button.classList.add("active");
    } else {
        const nav = [...document.querySelectorAll("#adminApp .nav-item")]
            .find(item => item.getAttribute("onclick")?.includes(`'${page}'`));

        if (nav) nav.classList.add("active");
    }

    const titles = {
        dashboard: "Dashboard",
        appointments: "Appointments",
        queue: "Queue Management",
        services: "Services",
        dentists: "Dentists",
        notifications: "Notifications",
        activityLogs: "Activity Logs",
        settings: "Settings"
    };

    document.getElementById("pageTitle").textContent =
        titles[page] || "OralCare Connect";

    document.getElementById("sidebar").classList.remove("open");
    renderAll();
}

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
}


/* =========================================
   16. CUSTOMER NAVIGATION
========================================= */

function showCustomerPage(page, button) {
    const target = document.getElementById(page);
    if (!target) return;

    document.querySelectorAll(".customer-page").forEach(section => {
        section.classList.remove("active");
    });

    target.classList.add("active");

    document.querySelectorAll(".customer-nav-item").forEach(item => {
        item.classList.remove("active");
    });

    if (button) {
        button.classList.add("active");
    } else {
        const nav = [...document.querySelectorAll(".customer-navigation .customer-nav-item")]
            .find(item => item.getAttribute("onclick")?.includes(`'${page}'`));

        if (nav) nav.classList.add("active");
    }

    const titles = {
        customerDashboard: "Dashboard",
        customerBooking: "Book Appointment",
        customerSchedule: "My Schedule",
        customerServices: "Services",
        customerDentists: "Dentists",
        customerAccount: "My Account"
    };

    document.getElementById("customerPageTitle").textContent =
        titles[page] || "OralCare Connect";

    if (page === "customerAccount") fillProfileForm();

    document.getElementById("customerSidebar").classList.remove("open");
    renderCustomerPortal();
}

function toggleCustomerSidebar() {
    document.getElementById("customerSidebar").classList.toggle("open");
}


/* =========================================
   17. APPOINTMENT MODALS
========================================= */

function openModal() {
    document.getElementById("appointmentDate").min = getToday();
    document.getElementById("appointmentModal").classList.add("show");
}

function closeModal() {
    document.getElementById("appointmentModal").classList.remove("show");
}

document.getElementById("appointmentModal").addEventListener("click", event => {
    if (event.target.id === "appointmentModal") closeModal();
});

function closeRescheduleModal() {
    document.getElementById("rescheduleModal").classList.remove("show");
}

document.getElementById("rescheduleModal").addEventListener("click", event => {
    if (event.target.id === "rescheduleModal") closeRescheduleModal();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeModal();
        closeRescheduleModal();
    }
});


/* =========================================
   18. CREATE ADMIN APPOINTMENT
========================================= */

document.getElementById("appointmentForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const name = document.getElementById("customerName").value.trim();
        const service = document.getElementById("serviceInput").value;
        const dentist = document.getElementById("adminDentistInput").value;
        const date = document.getElementById("appointmentDate").value;
        const time = document.getElementById("appointmentTime").value;

        if (!name || !service || !dentist || !date || !time) {
            alert("Please complete all fields.");
            return;
        }

        if (date < getToday()) {
            alert("Please select today or a future date.");
            return;
        }

        const duplicate = appointments.some(a =>
            String(a.patientName || a.name).toLowerCase() === name.toLowerCase() &&
            a.service === service &&
            a.dentist === dentist &&
            a.date === date &&
            a.time === time &&
            !["Rejected", "Cancelled"].includes(normalizeStatus(a.status))
        );

        if (duplicate) {
            alert("This appointment already exists.");
            return;
        }

        const data = {
            patientName: name,
            name,
            email: "",
            userId: "",
            service,
            dentist,
            date,
            time,
            status: "pending",
            queueNumber: 0
        };

        if (isFirebaseAvailable && db) {
            try {
                const ref = db.collection("appointments").doc();
                await ref.set(data);
            } catch (error) {
                console.error("Appointment save failed:", error);
                alert("The appointment could not be saved.");
                return;
            }
        } else {
            data.id = Date.now().toString();
            data.status = "Pending";
            appointments.push(data);
            saveData();
        }

        addNotification(`New appointment added for ${name}.`);

        await recordActivity(
            "Appointment",
            `Administrator created an appointment for ${name}.`
        );

        this.reset();
        closeModal();
        renderAll();

        alert("Appointment successfully added.");
    }
);


/* =========================================
   19. CUSTOMER BOOKING
========================================= */

document.getElementById("customerBookingForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        if (!currentUser || currentUser.role !== "customer") return;

        const error = document.getElementById("bookingError");
        error.textContent = "";

        let bookingBlockedUntil = currentUser.bookingBlockedUntil || null;

        if (isFirebaseAvailable && db && currentUser.uid) {
            try {
                const profileDoc = await db
                    .collection("users")
                    .doc(currentUser.uid)
                    .get();

                if (profileDoc.exists) {
                    bookingBlockedUntil =
                        profileDoc.data().bookingBlockedUntil || null;

                    currentUser.bookingBlockedUntil = bookingBlockedUntil;
                    saveSession(currentUser);
                }
            } catch (checkError) {
                console.error("Booking restriction check failed:", checkError);
                error.textContent =
                    "Unable to verify your booking eligibility. Please try again.";
                return;
            }
        }

        if (
            bookingBlockedUntil &&
            new Date(bookingBlockedUntil).getTime() > Date.now()
        ) {
            const until = new Date(bookingBlockedUntil).toLocaleString();

            error.textContent =
                `Your booking privileges are temporarily suspended until ${until}.`;
            return;
        }

        const service = document.getElementById("customerService").value;
        const dentist = document.getElementById("customerDentist").value;
        const date = document.getElementById("customerAppointmentDate").value;
        const time = document.getElementById("customerAppointmentTime").value;

        if (!service || !dentist || !date || !time) {
            error.textContent = "Please complete all fields.";
            return;
        }

        if (date < getToday()) {
            error.textContent = "Please select today or a future date.";
            return;
        }

        const duplicate = appointments.some(a =>
            (
                a.email?.toLowerCase() === currentUser.email.toLowerCase() ||
                (currentUser.uid && a.userId === currentUser.uid)
            ) &&
            a.service === service &&
            a.dentist === dentist &&
            a.date === date &&
            a.time === time &&
            !["Rejected", "Cancelled"].includes(normalizeStatus(a.status))
        );

        if (duplicate) {
            error.textContent = "You already have an appointment at this schedule.";
            return;
        }

        const data = {
            patientName: currentUser.name,
            name: currentUser.name,
            email: currentUser.email,
            userId: currentUser.uid || "",
            service,
            dentist,
            date,
            time,
            status: "pending",
            queueNumber: 0,
            pendingReschedule: null
        };

        if (isFirebaseAvailable && db) {
            try {
                const ref = db.collection("appointments").doc();
                await ref.set(data);
            } catch (saveError) {
                console.error("Booking save failed:", saveError);
                error.textContent =
                    "Your appointment could not be submitted. Please try again.";
                return;
            }
        } else {
            data.id = Date.now().toString();
            data.status = "Pending";
            appointments.push(data);
            saveData();
        }

        addNotification(`New appointment submitted by ${currentUser.name}.`);

        await recordActivity(
            "Appointment",
            `${currentUser.name} submitted an appointment request.`
        );

        this.reset();

        alert("Your appointment request has been submitted.");

        showCustomerPage("customerSchedule");
        renderAll();
    }
);


/* =========================================
   20. RESCHEDULE REQUEST
========================================= */

function openRescheduleModal(id) {
    const appointment = appointments.find(a => String(a.id) === String(id));

    if (!appointment || !currentUser) return;

    const belongsToUser =
        appointment.email?.toLowerCase() === currentUser.email.toLowerCase() ||
        (currentUser.uid && appointment.userId === currentUser.uid);

    if (!belongsToUser) {
        alert("You can only reschedule your own appointments.");
        return;
    }

    if (!["Pending", "Approved"].includes(normalizeStatus(appointment.status))) {
        alert("This appointment cannot be rescheduled.");
        return;
    }

    if (appointment.pendingReschedule) {
        alert("You already have a reschedule request awaiting review.");
        return;
    }

    document.getElementById("rescheduleAppointmentId").value = id;
    document.getElementById("rescheduleDate").min = getToday();
    document.getElementById("rescheduleDate").value = "";
    document.getElementById("rescheduleTime").value = "";
    document.getElementById("rescheduleError").textContent = "";

    document.getElementById("rescheduleModal").classList.add("show");
}

document.getElementById("rescheduleForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const id = document.getElementById("rescheduleAppointmentId").value;
        const date = document.getElementById("rescheduleDate").value;
        const time = document.getElementById("rescheduleTime").value;
        const error = document.getElementById("rescheduleError");

        error.textContent = "";

        const appointment = appointments.find(a => String(a.id) === String(id));

        if (!appointment) {
            error.textContent = "Appointment not found.";
            return;
        }

        if (!date || !time) {
            error.textContent = "Please select a date and time.";
            return;
        }

        if (date < getToday()) {
            error.textContent = "Please select today or a future date.";
            return;
        }

        if (date === appointment.date && time === appointment.time) {
            error.textContent = "Choose a different date or time.";
            return;
        }

        if (appointment.pendingReschedule) {
            error.textContent = "A reschedule request is already pending.";
            return;
        }

        const request = {
            date,
            time,
            requestedAt: new Date().toISOString(),
            requestedBy: currentUser.uid || currentUser.email,
            status: "pending"
        };

        if (isFirebaseAvailable && db) {
            try {
                await db.collection("appointments").doc(String(id)).update({
                    pendingReschedule: request
                });
            } catch (saveError) {
                console.error("Reschedule request failed:", saveError);
                error.textContent = "Your request could not be submitted.";
                return;
            }
        } else {
            appointment.pendingReschedule = request;
            saveData();
        }

        addNotification(`${currentUser.name} requested an appointment reschedule.`);

        await recordActivity(
            "Reschedule",
            `${currentUser.name} requested a new appointment date and time.`
        );

        closeRescheduleModal();
        renderAll();

        alert("Your reschedule request has been sent for administrator approval.");
    }
);

async function reviewReschedule(id, decision) {
    if (!currentUser || currentUser.role !== "admin") return;

    const appointment = appointments.find(a => String(a.id) === String(id));
    if (!appointment || !appointment.pendingReschedule) return;

    const request = appointment.pendingReschedule;

    if (decision === "approve") {
        const updates = {
            date: request.date,
            time: request.time,
            pendingReschedule: null,
            queueNumber: 0,
            status: "pending"
        };

        if (isFirebaseAvailable && db) {
            try {
                await db.collection("appointments").doc(String(id)).update(updates);
            } catch (error) {
                console.error("Reschedule approval failed:", error);
                alert("The reschedule request could not be approved.");
                return;
            }
        } else {
            Object.assign(appointment, updates);
            appointment.status = "Pending";
            saveData();
        }

        addNotification(
            `Reschedule request for ${appointment.patientName} was approved.`
        );

        await recordActivity(
            "Reschedule",
            `Administrator approved a reschedule request for ${appointment.patientName}.`
        );

    } else {
        if (isFirebaseAvailable && db) {
            try {
                await db.collection("appointments").doc(String(id)).update({
                    pendingReschedule: null
                });
            } catch (error) {
                console.error("Reschedule rejection failed:", error);
                alert("The request could not be rejected.");
                return;
            }
        } else {
            appointment.pendingReschedule = null;
            saveData();
        }

        addNotification(
            `Reschedule request for ${appointment.patientName} was declined.`
        );

        await recordActivity(
            "Reschedule",
            `Administrator declined a reschedule request for ${appointment.patientName}.`
        );
    }

    renderAll();
}


/* =========================================
   21. CANCEL CUSTOMER APPOINTMENT
========================================= */

async function cancelAppointment(id) {
    if (!currentUser || currentUser.role !== "customer") return;

    const appointment = appointments.find(a => String(a.id) === String(id));
    if (!appointment) return;

    const belongsToUser =
        appointment.email?.toLowerCase() === currentUser.email.toLowerCase() ||
        (currentUser.uid && appointment.userId === currentUser.uid);

    if (!belongsToUser) return;

    const status = normalizeStatus(appointment.status);

    if (!["Pending", "Approved"].includes(status)) {
        alert("This appointment can no longer be cancelled.");
        return;
    }

    if (appointment.cancellationRequestedAt) {
        alert("You already have a cancellation request awaiting approval.");
        return;
    }

    if (!confirm(
        "Send a cancellation request to the administrator? Your appointment will remain active until the request is reviewed."
    )) return;

    const updates = {
        previousStatus: status,
        status: "cancellation requested",
        cancellationRequestedAt: new Date().toISOString()
    };

    if (isFirebaseAvailable && db) {
        try {
            await db.collection("appointments")
                .doc(String(id))
                .update(updates);
        } catch (error) {
            console.error("Cancellation request failed:", error);
            alert("Your cancellation request could not be submitted.");
            return;
        }
    } else {
        Object.assign(appointment, updates);
        saveData();
    }

    appointment.previousStatus = status;
    appointment.status = "Cancellation Requested";
    appointment.cancellationRequestedAt = updates.cancellationRequestedAt;

    addNotification(
        `${currentUser.name} requested to cancel an appointment.`
    );

    await recordActivity(
        "Cancellation",
        `${currentUser.name} submitted an appointment cancellation request.`
    );

    alert("Your cancellation request has been sent for administrator approval.");

    renderAll();
}


/* =========================================
   22. ADMIN CANCELLATION REVIEW
========================================= */

async function reviewCancellation(id, decision) {
    if (!currentUser || currentUser.role !== "admin") return;

    const appointment = appointments.find(a => String(a.id) === String(id));

    if (
        !appointment ||
        normalizeStatus(appointment.status) !== "Cancellation Requested"
    ) {
        return;
    }

    if (!["approve", "reject"].includes(decision)) return;

    const now = new Date();
    const reviewedAt = now.toISOString();

    if (decision === "approve") {
        const bookingBlockedUntil = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        const updates = {
            status: "cancelled",
            queueNumber: 0,
            pendingReschedule: null,
            bookingBlockedUntil,
            cancellationReviewedAt: reviewedAt
        };

        if (isFirebaseAvailable && db) {
            try {
                const batch = db.batch();

                const appointmentRef = db
                    .collection("appointments")
                    .doc(String(id));

                batch.update(appointmentRef, updates);

                if (appointment.userId) {
                    const userRef = db
                        .collection("users")
                        .doc(String(appointment.userId));

                    batch.set(userRef, {
                        bookingBlockedUntil
                    }, { merge: true });

                } else if (appointment.email) {
                    const userSnapshot = await db
                        .collection("users")
                        .where("email", "==", appointment.email)
                        .limit(1)
                        .get();

                    if (!userSnapshot.empty) {
                        batch.set(userSnapshot.docs[0].ref, {
                            bookingBlockedUntil
                        }, { merge: true });
                    }
                }

                await batch.commit();

            } catch (error) {
                console.error("Cancellation approval failed:", error);
                alert("The cancellation request could not be approved.");
                return;
            }
        } else {
            const accounts = getAccounts();

            const account = accounts.find(item =>
                (appointment.userId && item.uid === appointment.userId) ||
                item.email?.toLowerCase() === appointment.email?.toLowerCase()
            );

            if (account) {
                account.bookingBlockedUntil = bookingBlockedUntil;
                saveAccounts(accounts);
            }

            Object.assign(appointment, updates);
        }

        appointment.status = "Cancelled";
        appointment.queueNumber = 0;
        appointment.pendingReschedule = null;
        appointment.bookingBlockedUntil = bookingBlockedUntil;
        appointment.cancellationReviewedAt = reviewedAt;

        addNotification(
            `Cancellation request for ${appointment.patientName} was approved.`
        );

        await recordActivity(
            "Cancellation",
            `Administrator approved the cancellation request for ${appointment.patientName}. The customer is restricted from booking for 7 days.`
        );

        alert("Cancellation approved. The customer cannot book for 7 days.");

    } else {
        const restoredStatus = normalizeStatus(
            appointment.previousStatus || "Pending"
        );

        const updates = {
            status: restoredStatus.toLowerCase(),
            previousStatus: null,
            cancellationRequestedAt: null,
            cancellationReviewedAt: reviewedAt
        };

        if (isFirebaseAvailable && db) {
            try {
                await db.collection("appointments")
                    .doc(String(id))
                    .update(updates);
            } catch (error) {
                console.error("Cancellation rejection failed:", error);
                alert("The cancellation request could not be rejected.");
                return;
            }
        }

        appointment.status = restoredStatus;
        appointment.previousStatus = null;
        appointment.cancellationRequestedAt = null;
        appointment.cancellationReviewedAt = reviewedAt;

        addNotification(
            `Cancellation request for ${appointment.patientName} was rejected.`
        );

        await recordActivity(
            "Cancellation",
            `Administrator rejected the cancellation request for ${appointment.patientName}.`
        );

        alert("Cancellation request rejected. The appointment remains active.");
    }

    rebuildQueueFromAppointments();
    saveData();
    renderAll();
}


/* =========================================
   23. UPDATE APPOINTMENT STATUS
========================================= */

async function updateStatus(id, status) {
    if (!currentUser || currentUser.role !== "admin") return;

    const appointment = appointments.find(a => String(a.id) === String(id));
    if (!appointment) return;

    const newStatus = normalizeStatus(status);

    const allowed = ["Approved", "Rejected", "Cancelled", "Completed"];

    if (!allowed.includes(newStatus) || normalizeStatus(appointment.status) === newStatus) return;

    if (
        newStatus === "Completed" &&
        !["Approved", "Serving"].includes(normalizeStatus(appointment.status))
    ) {
        alert("Only approved or serving appointments can be completed.");
        return;
    }

    let queueNumber = Number(appointment.queueNumber) || 0;

    if (newStatus === "Approved" && !queueNumber) {
        const sameDay = appointments.filter(a =>
            a.date === appointment.date && Number(a.queueNumber) > 0
        );

        queueNumber = sameDay.reduce(
            (max, a) => Math.max(max, Number(a.queueNumber) || 0),
            0
        ) + 1;
    }

    if (["Rejected", "Cancelled", "Completed"].includes(newStatus)) {
        queueNumber = 0;
    }

    const updates = {
        status: newStatus.toLowerCase(),
        queueNumber
    };

    if (isFirebaseAvailable && db) {
        try {
            await db.collection("appointments").doc(String(id)).update(updates);
        } catch (error) {
            console.error("Status update failed:", error);
            alert("The appointment could not be updated. Please try again.");
            return;
        }
    } else {
        appointment.status = newStatus;
        appointment.queueNumber = queueNumber;
        saveData();
    }

    appointment.status = newStatus;
    appointment.queueNumber = queueNumber;
    appointment.queue = queueNumber
        ? `Q-${String(queueNumber).padStart(3, "0")}`
        : null;

    rebuildQueueFromAppointments();

    addNotification(
        `${appointment.patientName}'s appointment is now ${newStatus}.`
    );

    await recordActivity(
        "Appointment",
        `Administrator changed ${appointment.patientName}'s appointment status to ${newStatus}.`
    );

    renderAll();
}


/* =========================================
   24. APPOINTMENT TABLE
========================================= */

function appointmentHTML(a) {
    const status = normalizeStatus(a.status);
    let actions = '<span class="muted">No actions</span>';

    if (status === "Pending") {
        actions = `
            <div class="action-group">
                <button class="btn btn-success"
                    onclick="updateStatus('${escapeHTML(a.id)}','Approved')">Approve</button>
                <button class="btn btn-danger"
                    onclick="updateStatus('${escapeHTML(a.id)}','Rejected')">Reject</button>
                <button class="btn btn-light"
                    onclick="deleteAppointment('${escapeHTML(a.id)}','admin')">Delete</button>
            </div>
        `;
    } else if (status === "Cancellation Requested") {
        actions = `
            <div class="action-group">
                <button class="btn btn-success"
                    onclick="reviewCancellation('${escapeHTML(a.id)}','approve')">
                    Approve Cancellation
                </button>
                <button class="btn btn-danger"
                    onclick="reviewCancellation('${escapeHTML(a.id)}','reject')">
                    Reject Cancellation
                </button>
                <button class="btn btn-light"
                    onclick="deleteAppointment('${escapeHTML(a.id)}','admin')">
                    Delete
                </button>
            </div>
        `;
    } else if (["Approved", "Serving"].includes(status)) {
        actions = `
            <div class="action-group">
                <button class="btn btn-success"
                    onclick="updateStatus('${escapeHTML(a.id)}','Completed')">Complete</button>
                ${status === "Approved" ? `
                    <button class="btn btn-light"
                        onclick="updateStatus('${escapeHTML(a.id)}','Cancelled')">Cancel</button>
                ` : ""}
                <button class="btn btn-danger"
                    onclick="deleteAppointment('${escapeHTML(a.id)}','admin')">Delete</button>
            </div>
        `;
    } else {
        actions = `
            <button class="btn btn-danger"
                onclick="deleteAppointment('${escapeHTML(a.id)}','admin')">Delete</button>
        `;
    }

    const reschedule = a.pendingReschedule
        ? `
            <div class="reschedule-request">
                <strong>Requested:</strong>
                ${escapeHTML(formatDate(a.pendingReschedule.date))}
                at ${escapeHTML(a.pendingReschedule.time)}
                <div class="action-group">
                    <button class="btn btn-success"
                        onclick="reviewReschedule('${escapeHTML(a.id)}','approve')">Approve New Time</button>
                    <button class="btn btn-danger"
                        onclick="reviewReschedule('${escapeHTML(a.id)}','reject')">Decline</button>
                </div>
            </div>
        `
        : "";

    return `
        <tr>
            <td>${escapeHTML(a.patientName || a.name)}</td>
            <td>${escapeHTML(a.service)}</td>
            <td>${escapeHTML(a.dentist || "Not assigned")}</td>
            <td>${escapeHTML(formatDate(a.date))}</td>
            <td>${escapeHTML(a.time)}</td>
            <td>
                <span class="status status-${status.toLowerCase().replace(/\s+/g, "-")}">
                    ${escapeHTML(status)}
                </span>
                ${reschedule}
            </td>
            <td>${actions}</td>
        </tr>
    `;
}

function renderAppointments() {
    const container = document.getElementById("appointmentTable");

    if (!appointments.length) {
        container.innerHTML =
            '<div class="empty-state">No appointments found.</div>';
        return;
    }

    const sorted = [...appointments].sort((a, b) =>
        (a.date + a.time).localeCompare(b.date + b.time)
    );

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Customer</th>
                    <th>Service</th>
                    <th>Dentist</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status / Requests</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map(appointmentHTML).join("")}
            </tbody>
        </table>
    `;
}


/* =========================================
   25. DELETE APPOINTMENT
========================================= */

async function deleteAppointment(id, actor = "customer") {
    const appointment = appointments.find(a => String(a.id) === String(id));
    if (!appointment) return;

    if (actor === "customer") {
        if (!currentUser || currentUser.role !== "customer") return;

        const belongsToUser =
            appointment.email?.toLowerCase() === currentUser.email.toLowerCase() ||
            (currentUser.uid && appointment.userId === currentUser.uid);

        if (!belongsToUser || normalizeStatus(appointment.status) !== "Cancelled") {
            alert("You can only delete your own cancelled appointments.");
            return;
        }
    } else if (!currentUser || currentUser.role !== "admin") {
        return;
    }

    const label = appointment.patientName || appointment.name || "this appointment";

    if (!confirm(`Delete ${label}'s appointment permanently?`)) return;

    if (isFirebaseAvailable && db) {
        try {
            await db.collection("appointments").doc(String(id)).delete();
        } catch (error) {
            console.error("Appointment deletion failed:", error);
            alert("The appointment could not be deleted.");
            return;
        }
    }

    appointments = appointments.filter(a => String(a.id) !== String(id));

    rebuildQueueFromAppointments();

    addNotification(`Appointment for ${label} was deleted.`);

    await recordActivity(
        "Appointment",
        `${currentUser.name} deleted an appointment for ${label}.`
    );

    saveData();
    renderAll();
}


/* =========================================
   26. SERVICES
========================================= */

function renderServices() {
    const adminContainer = document.getElementById("serviceList");
    const customerContainer = document.getElementById("customerServiceList");
    const adminSelect = document.getElementById("serviceInput");
    const customerSelect = document.getElementById("customerService");

    if (!services.length) {
        adminContainer.innerHTML =
            '<div class="empty-state">No services available.</div>';

        customerContainer.innerHTML =
            '<div class="empty-state">No services available.</div>';

        adminSelect.innerHTML = '<option value="">No services available</option>';
        customerSelect.innerHTML = '<option value="">No services available</option>';
        return;
    }

    const cards = services.map(service => `
        <div class="service-card">
            <div class="service-icon">+</div>
            <h3>${escapeHTML(service.name)}</h3>
            <p>${escapeHTML(service.description)}</p>
            <span class="status status-approved">Available</span>
        </div>
    `).join("");

    adminContainer.innerHTML = cards;
    customerContainer.innerHTML = cards;

    const options = `
        <option value="">Select a service</option>
        ${services.map(service => `
            <option value="${escapeHTML(service.name)}">
                ${escapeHTML(service.name)}
            </option>
        `).join("")}
    `;

    adminSelect.innerHTML = options;
    customerSelect.innerHTML = options;
}


/* =========================================
   27. DENTISTS
========================================= */

document.getElementById("dentistForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        if (!currentUser || currentUser.role !== "admin") return;

        const name = document.getElementById("dentistName").value.trim();
        const specialty = document.getElementById("dentistSpecialty").value.trim();
        const bio = document.getElementById("dentistBio").value.trim();
        const photo = document.getElementById("dentistPhoto").value.trim();

        if (!name || !specialty) return;

        if (dentists.some(d => d.name.toLowerCase() === name.toLowerCase())) {
            alert("This dentist already exists.");
            return;
        }

        dentists.push({
            id: Date.now(),
            name,
            specialty,
            bio: bio || "Available for dental appointments and consultations.",
            photo
        });

        addNotification(`${name} was added to the dentist list.`);

        await recordActivity("Dentist", `Administrator added dentist ${name}.`);

        saveData();
        this.reset();
        renderAll();

        alert("Dentist successfully added.");
    }
);

async function removeDentist(id) {
    if (!currentUser || currentUser.role !== "admin") return;

    const dentist = dentists.find(d => Number(d.id) === Number(id));
    if (!dentist) return;

    const hasAppointments = appointments.some(a =>
        a.dentist === dentist.name &&
        !["Rejected", "Cancelled", "Completed"].includes(normalizeStatus(a.status))
    );

    if (hasAppointments) {
        alert("This dentist has active appointments and cannot be removed.");
        return;
    }

    if (!confirm(`Remove ${dentist.name} from the dentist list?`)) return;

    dentists = dentists.filter(d => Number(d.id) !== Number(id));

    addNotification(`${dentist.name} was removed from the dentist list.`);

    await recordActivity("Dentist", `Administrator removed dentist ${dentist.name}.`);

    saveData();
    renderAll();
}

function renderDentists() {
    const container = document.getElementById("dentistList");
    const customerCards = document.getElementById("customerDentistList");
    const customerSelect = document.getElementById("customerDentist");
    const adminSelect = document.getElementById("adminDentistInput");

    if (!dentists.length) {
        container.innerHTML =
            '<div class="empty-state">No dentists available.</div>';

        customerCards.innerHTML =
            '<div class="empty-state">No dentists available.</div>';

        customerSelect.innerHTML = '<option value="">No dentists available</option>';
        adminSelect.innerHTML = '<option value="">No dentists available</option>';
        return;
    }

    container.innerHTML = dentists.map(d => `
        <div class="dentist-item">
            <div>
                <h4>${escapeHTML(d.name)}</h4>
                <p>${escapeHTML(d.specialty)}</p>
                <small>${escapeHTML(d.bio || "")}</small>
            </div>
            <button class="btn btn-danger" onclick="removeDentist(${Number(d.id)})">
                Remove
            </button>
        </div>
    `).join("");

    customerCards.innerHTML = dentists.map(d => `
        <article class="dentist-card">
            ${
                d.photo
                    ? `<img src="${escapeHTML(d.photo)}"
                        alt="${escapeHTML(d.name)}"
                        class="dentist-photo"
                        loading="lazy"
                        onerror="this.style.display='none'">`
                    : `<div class="dentist-photo dentist-photo-placeholder">OC</div>`
            }
            <div class="dentist-card-content">
                <h3>${escapeHTML(d.name)}</h3>
                <p class="dentist-specialty">${escapeHTML(d.specialty)}</p>
                <p>${escapeHTML(d.bio || "")}</p>
            </div>
        </article>
    `).join("");

    const options = `
        <option value="">Select a dentist</option>
        ${dentists.map(d => `
            <option value="${escapeHTML(d.name)}">
                ${escapeHTML(d.name)} - ${escapeHTML(d.specialty)}
            </option>
        `).join("")}
    `;

    customerSelect.innerHTML = options;
    adminSelect.innerHTML = options;
}


/* =========================================
   28. CUSTOMER PROFILE
========================================= */

function fillProfileForm() {
    if (!currentUser) return;

    const parts = splitName(currentUser.name);

    document.getElementById("profileFirstName").value =
        currentUser.firstName || parts.firstName;

    document.getElementById("profileMiddleName").value =
        currentUser.middleName || parts.middleName;

    document.getElementById("profileLastName").value =
        currentUser.lastName || parts.lastName;

    document.getElementById("profilePhone").value = currentUser.phone || "";
    document.getElementById("profileAge").value = currentUser.age || "";
    document.getElementById("profileGender").value = currentUser.gender || "";
    document.getElementById("profileEmail").value = currentUser.email || "";

    document.getElementById("profilePassword").value = "";
    document.getElementById("profileConfirmPassword").value = "";

    document.getElementById("profileError").textContent = "";
    document.getElementById("profileSuccess").textContent = "";
}

document.getElementById("profileForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        if (!currentUser || currentUser.role !== "customer") return;

        const firstName = document.getElementById("profileFirstName").value.trim();
        const middleName = document.getElementById("profileMiddleName").value.trim();
        const lastName = document.getElementById("profileLastName").value.trim();
        const phone = document.getElementById("profilePhone").value.trim();
        const age = document.getElementById("profileAge").value;
        const gender = document.getElementById("profileGender").value;
        const email = document.getElementById("profileEmail").value.trim().toLowerCase();
        const password = document.getElementById("profilePassword").value;
        const confirmPassword = document.getElementById("profileConfirmPassword").value;

        const error = document.getElementById("profileError");
        const success = document.getElementById("profileSuccess");

        error.textContent = "";
        success.textContent = "";

        if (!firstName || !lastName || !email) {
            error.textContent = "Please complete your required information.";
            return;
        }

        if (!isValidPhone(phone)) {
            error.textContent = "Phone number must contain exactly 11 digits.";
            return;
        }

        if (!isValidAge(age)) {
            error.textContent = "Please enter a valid age.";
            return;
        }

        if (!gender) {
            error.textContent = "Please select your gender.";
            return;
        }

        if (password && password.length < 8) {
            error.textContent = "New password must contain at least 8 characters.";
            return;
        }

        if (password !== confirmPassword) {
            error.textContent = "Passwords do not match.";
            return;
        }

        if (email === ADMIN_ACCOUNT.email.toLowerCase()) {
            error.textContent = "This email address cannot be used.";
            return;
        }

        const name = fullName(firstName, middleName, lastName);
        const oldEmail = currentUser.email;

        const profile = {
            firstName,
            middleName,
            lastName,
            name,
            phone,
            age: Number(age),
            gender,
            email
        };

        if (isFirebaseAvailable && auth && auth.currentUser && db) {
            try {
                const firebaseUser = auth.currentUser;

                if (email !== oldEmail) await firebaseUser.updateEmail(email);
                if (password) await firebaseUser.updatePassword(password);

                await firebaseUser.updateProfile({ displayName: name });

                await db.collection("users").doc(firebaseUser.uid).set(
                    profile,
                    { merge: true }
                );

                currentUser = { ...currentUser, ...profile };
                saveSession(currentUser);

            } catch (firebaseError) {
                console.error("Profile update failed:", firebaseError);

                if (firebaseError.code === "auth/requires-recent-login") {
                    error.textContent =
                        "For security, log out and log in again before changing your email or password.";
                } else if (firebaseError.code === "auth/email-already-in-use") {
                    error.textContent = "This email address is already in use.";
                } else {
                    error.textContent =
                        "Your profile could not be updated. Please try again.";
                }

                return;
            }
        } else {
            const accounts = getAccounts();
            const account = accounts.find(
                item => item.email?.toLowerCase() === oldEmail.toLowerCase()
            );

            if (account) {
                const emailExists = accounts.some(item =>
                    item.email?.toLowerCase() === email &&
                    item.id !== account.id
                );

                if (emailExists) {
                    error.textContent = "This email address is already in use.";
                    return;
                }

                Object.assign(account, profile);
                if (password) account.password = password;

                saveAccounts(accounts);
            }

            currentUser = { ...currentUser, ...profile };
            saveSession(currentUser);
        }

        appointments.forEach(a => {
            if (
                a.email?.toLowerCase() === oldEmail.toLowerCase() ||
                (currentUser.uid && a.userId === currentUser.uid)
            ) {
                a.email = email;
                a.patientName = name;
                a.name = name;
            }
        });

        queue.forEach(q => {
            if (q.email?.toLowerCase() === oldEmail.toLowerCase()) {
                q.email = email;
                q.name = name;
            }
        });

        saveData();

        document.getElementById("customerHeaderName").textContent = name;
        document.getElementById("customerSidebarName").textContent = name;
        document.getElementById("customerWelcome").textContent = `Welcome, ${name}!`;
        document.getElementById("customerAvatar").textContent =
            name.charAt(0).toUpperCase();

        document.getElementById("profilePassword").value = "";
        document.getElementById("profileConfirmPassword").value = "";

        success.textContent = "Your profile has been updated successfully.";

        await recordActivity("Profile", `${name} updated their profile.`);
        renderAll();
    }
);


/* =========================================
   29. CUSTOMER APPOINTMENTS
========================================= */

function getCustomerAppointments() {
    if (!currentUser) return [];

    return appointments
        .filter(a =>
            (
                a.email &&
                a.email.toLowerCase() === currentUser.email.toLowerCase()
            ) ||
            (
                currentUser.uid &&
                a.userId === currentUser.uid
            )
        )
        .sort((a, b) =>
            (b.date + b.time).localeCompare(a.date + a.time)
        );
}

function renderCustomerPortal() {
    if (!currentUser || currentUser.role !== "customer") return;

    const mine = getCustomerAppointments();

    document.getElementById("customerTotalAppointments").textContent = mine.length;

    document.getElementById("customerPendingAppointments").textContent =
        mine.filter(a => normalizeStatus(a.status) === "Pending").length;

    document.getElementById("customerApprovedAppointments").textContent =
        mine.filter(a =>
            ["Approved", "Serving"].includes(normalizeStatus(a.status))
        ).length;

    const recent = mine.slice(0, 5);

    document.getElementById("customerRecentAppointments").innerHTML =
        recent.length
            ? `
                <table>
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Dentist</th>
                            <th>Date</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recent.map(a => {
                            const status = normalizeStatus(a.status);

                            return `
                                <tr>
                                    <td>${escapeHTML(a.service)}</td>
                                    <td>${escapeHTML(a.dentist || "Not assigned")}</td>
                                    <td>${escapeHTML(formatDate(a.date))}</td>
                                    <td>
                                        <span class="status status-${status.toLowerCase().replace(/\s+/g, "-")}">
                                            ${escapeHTML(status)}
                                        </span>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            `
            : '<div class="empty-state">You have no appointments yet.</div>';

    document.getElementById("customerAppointmentTable").innerHTML =
        mine.length
            ? `
                <table>
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Dentist</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Queue</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${mine.map(a => {
                            const status = normalizeStatus(a.status);
                            let actions = '<span class="muted">—</span>';

                            if (["Pending", "Approved"].includes(status)) {
                                actions = `
                                    <div class="action-group">
                                        <button class="btn btn-light"
                                            onclick="openRescheduleModal('${escapeHTML(a.id)}')"
                                            ${a.pendingReschedule ? "disabled" : ""}>
                                            Reschedule
                                        </button>
                                        <button class="btn btn-danger"
                                            onclick="cancelAppointment('${escapeHTML(a.id)}')">
                                            Request Cancellation
                                        </button>
                                    </div>
                                    ${a.pendingReschedule
                                        ? '<small class="reschedule-note">Reschedule request awaiting review</small>'
                                        : ""}
                                `;
                            } else if (status === "Cancellation Requested") {
                                actions = `
                                    <small class="reschedule-note">
                                        Cancellation request awaiting admin approval.
                                    </small>
                                `;
                            } else if (status === "Cancelled") {
                                actions = `
                                    <button class="btn btn-danger"
                                        onclick="deleteAppointment('${escapeHTML(a.id)}','customer')">
                                        Delete
                                    </button>
                                `;
                            }

                            return `
                                <tr>
                                    <td>${escapeHTML(a.service)}</td>
                                    <td>${escapeHTML(a.dentist || "Not assigned")}</td>
                                    <td>${escapeHTML(formatDate(a.date))}</td>
                                    <td>${escapeHTML(a.time)}</td>
                                    <td>${escapeHTML(
                                        a.queue ||
                                        (a.queueNumber
                                            ? `Q-${String(a.queueNumber).padStart(3, "0")}`
                                            : "—")
                                    )}</td>
                                    <td>
                                        <span class="status status-${status.toLowerCase().replace(/\s+/g, "-")}">
                                            ${escapeHTML(status)}
                                        </span>
                                    </td>
                                    <td>${actions}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            `
            : '<div class="empty-state">You have no appointments yet.</div>';

    const active = mine.find(a =>
        a.queueNumber > 0 &&
        ["Approved", "Serving"].includes(normalizeStatus(a.status))
    );

    document.getElementById("customerQueueNumber").textContent =
        active ? `Q-${String(active.queueNumber).padStart(3, "0")}` : "—";

    document.getElementById("customerCurrentQueue").textContent = currentQueue;

    let message = "You currently have no active queue.";

    if (active && normalizeStatus(active.status) === "Approved") {
        message = "Your appointment is approved. Please wait for your turn.";
    } else if (active && normalizeStatus(active.status) === "Serving") {
        message = "It is your turn! Please proceed.";
    } else if (mine.some(a => normalizeStatus(a.status) === "Completed")) {
        message = "Your previous service has been completed.";
    }

    document.getElementById("customerQueueStatus").textContent = message;
}


/* =========================================
   30. SETTINGS
========================================= */

function loadSettings() {
    let settings = {};

    try {
        settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (error) {
        console.warn("Could not load settings:", error);
    }

    const fields = {
        settingClinicName: "clinicName",
        settingPhone: "phone",
        settingEmail: "email",
        settingAddress: "address",
        settingOpening: "opening",
        settingClosing: "closing",
        settingAdminName: "adminName"
    };

    Object.entries(fields).forEach(([id, key]) => {
        const element = document.getElementById(id);

        if (element && settings[key] !== undefined) {
            element.value = settings[key];
        }
    });

    const adminEmail = document.getElementById("settingAdminEmail");

    if (adminEmail) adminEmail.value = ADMIN_ACCOUNT.email;
}

document.getElementById("settingsForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const settings = {
            clinicName: document.getElementById("settingClinicName").value.trim(),
            phone: document.getElementById("settingPhone").value.trim(),
            email: document.getElementById("settingEmail").value.trim(),
            address: document.getElementById("settingAddress").value.trim(),
            opening: document.getElementById("settingOpening").value,
            closing: document.getElementById("settingClosing").value,
            adminName: document.getElementById("settingAdminName").value.trim()
        };

        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

        if (currentUser?.role === "admin" && settings.adminName) {
            currentUser.name = settings.adminName;
            saveSession(currentUser);

            document.getElementById("adminName").textContent = settings.adminName;

            document.querySelector("#adminApp .avatar").textContent =
                settings.adminName.charAt(0).toUpperCase();
        }

        document.getElementById("settingsMessage").textContent =
            "Settings saved successfully.";

        await recordActivity("Settings", "Administrator updated clinic settings.");
    }
);

document.getElementById("settingsForm").addEventListener(
    "reset",
    () => setTimeout(loadSettings, 0)
);


/* =========================================
   31. ADMIN DASHBOARD
========================================= */

function renderDashboard() {
    document.getElementById("totalAppointments").textContent =
        appointments.length;

    document.getElementById("pendingAppointments").textContent =
        appointments.filter(a => normalizeStatus(a.status) === "Pending").length;

    document.getElementById("approvedAppointments").textContent =
        appointments.filter(a => normalizeStatus(a.status) === "Approved").length;

    document.getElementById("totalServices").textContent = services.length;

    const recent = [...appointments]
        .sort((a, b) =>
            (b.date + b.time).localeCompare(a.date + a.time)
        )
        .slice(0, 5);

    document.getElementById("dashboardAppointments").innerHTML =
        recent.length
            ? `
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recent.map(a => {
                                const status = normalizeStatus(a.status);

                                return `
                                    <tr>
                                        <td>${escapeHTML(a.patientName || a.name)}</td>
                                        <td>${escapeHTML(formatDate(a.date))}</td>
                                        <td>
                                            <span class="status status-${status.toLowerCase().replace(/\s+/g, "-")}">
                                                ${escapeHTML(status)}
                                            </span>
                                        </td>
                                        <td>
                                            <button class="btn btn-danger"
                                                onclick="deleteAppointment('${escapeHTML(a.id)}','admin')">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            `
            : '<div class="empty-state">No recent appointments.</div>';
}


/* =========================================
   32. RENDER ALL
========================================= */

function renderAll() {
    renderDashboard();
    renderAppointments();
    renderQueue();
    renderServices();
    renderDentists();
    renderNotifications();
    renderActivityLogs();
    renderCustomerPortal();
}


/* =========================================
   33. SESSION RESTORATION
========================================= */

function restoreSession() {
    const savedSession = getSession();

    if (
        savedSession &&
        ["admin", "customer"].includes(savedSession.role)
    ) {
        currentUser = savedSession;
        document.getElementById("authSection").hidden = true;

        if (currentUser.role === "admin") {
            openAdminPortal();
        } else {
            openCustomerPortal();
        }
    } else {
        document.getElementById("authSection").hidden = false;
        document.getElementById("adminApp").hidden = true;
        document.getElementById("customerApp").hidden = true;
    }
}


/* =========================================
   34. INITIALIZATION
========================================= */

loadData();
loadActivityLogs();
loadSettings();
updatePasswordStrength();
startLockoutTimer();
restoreSession();
renderAll();

initFirestoreSync();
initActivityLogSync();
