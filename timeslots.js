"use strict";

/* =========================================
   ORALCARE CONNECT
   TIME SLOT PICKER
   Loaded after script.js. It does not change
   script.js. It fills a hidden time input with
   the chosen slot, so the existing booking,
   reschedule and admin code keeps working.
========================================= */

(function () {

    /* ---------- Settings ----------
       Edit this list to change the available times.
       The lunch break (12:00 - 13:00) is left out. */

    const TIME_SLOTS = [
        "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
        "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
        "16:00", "16:30", "17:00"
    ];

    /* Appointments with these statuses do not block a slot
       (same rule script.js uses for its duplicate check). */
    const INACTIVE_STATUSES = ["Rejected", "Cancelled"];

    const pickers = [];


    /* ---------- Helpers ---------- */

    function getTodayString() {
        const date = new Date();

        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function getCurrentTime() {
        const now = new Date();

        return String(now.getHours()).padStart(2, "0") + ":" +
               String(now.getMinutes()).padStart(2, "0");
    }

    function getValue(id) {
        const element = document.getElementById(id);
        return element ? element.value : "";
    }

    function getBookedTimes(date, dentist) {
        if (!date || !dentist) return [];

        if (typeof appointments === "undefined" || !Array.isArray(appointments)) {
            return [];
        }

        return appointments
            .filter(a =>
                a.date === date &&
                a.dentist === dentist &&
                !INACTIVE_STATUSES.includes(a.status)
            )
            .map(a => a.time);
    }


    /* ---------- Picker ---------- */

    function createPicker(config) {
        const container = document.getElementById(config.containerId);
        const timeInput = document.getElementById(config.timeInputId);
        const dateInput = document.getElementById(config.dateInputId);

        if (!container || !timeInput || !dateInput) return;

        container.innerHTML =
            '<div class="time-slots-grid" role="radiogroup" aria-label="Select time slot"></div>' +
            '<p class="time-slots-hint" aria-live="polite"></p>';

        const grid = container.querySelector(".time-slots-grid");
        const hint = container.querySelector(".time-slots-hint");

        function render() {
            const date = dateInput.value;
            const dentist = config.getDentist ? config.getDentist() : "";
            const today = getTodayString();

            const booked = getBookedTimes(date, dentist);
            const pastDate = Boolean(date) && date < today;
            const isToday = date === today;
            const now = getCurrentTime();

            const isUnavailable = time =>
                pastDate ||
                booked.includes(time) ||
                (isToday && time <= now);

            let notice = "";

            /* A chosen time that is no longer open is cleared. */
            if (timeInput.value && isUnavailable(timeInput.value)) {
                timeInput.value = "";
                notice = "Your previous time is no longer available. Please choose another one.";
            }

            const selected = timeInput.value;

            const focusedTime = grid.contains(document.activeElement)
                ? document.activeElement.dataset.time
                : null;

            grid.innerHTML = TIME_SLOTS.map(time => {
                const active = time === selected;
                const unavailable = isUnavailable(time);

                return '<button type="button" class="time-slot' +
                    (active ? " selected" : "") + '"' +
                    ' role="radio" aria-checked="' + active + '"' +
                    ' data-time="' + time + '"' +
                    (unavailable ? ' disabled title="Not available"' : "") +
                    ">" + time + "</button>";
            }).join("");

            if (focusedTime) {
                const again = grid.querySelector('[data-time="' + focusedTime + '"]:not(:disabled)');
                if (again) again.focus();
            }

            const anyOpen = TIME_SLOTS.some(time => !isUnavailable(time));

            if (notice) {
                hint.textContent = notice;
            } else if (pastDate) {
                hint.textContent = "Please choose today or a future date.";
            } else if (!date) {
                hint.textContent = "Choose a date to see which times are still open.";
            } else if (!dentist) {
                hint.textContent = "Choose a dentist to see which times are still open.";
            } else if (!anyOpen) {
                hint.textContent = "No time slots are open on this date. Please choose another date.";
            } else if (booked.length || isToday) {
                hint.textContent = "Greyed-out times are not available.";
            } else {
                hint.textContent = "";
            }
        }

        grid.addEventListener("click", event => {
            const button = event.target.closest(".time-slot");

            if (!button || button.disabled) return;

            timeInput.value = button.dataset.time;
            render();
        });

        dateInput.addEventListener("change", render);
        dateInput.addEventListener("input", render);

        (config.watchIds || []).forEach(id => {
            const element = document.getElementById(id);
            if (element) element.addEventListener("change", render);
        });

        /* form.reset() clears the time input, so redraw afterwards */
        const form = timeInput.closest("form");

        if (form) {
            form.addEventListener("reset", () => setTimeout(render, 0));
        }

        /* Redraw whenever a modal is opened */
        if (config.modalId) {
            const modal = document.getElementById(config.modalId);

            if (modal) {
                new MutationObserver(() => {
                    if (modal.classList.contains("show")) render();
                }).observe(modal, { attributes: true, attributeFilter: ["class"] });
            }
        }

        pickers.push({ render });
        render();
    }


    /* ---------- Keep slots up to date ----------
       script.js calls renderAll() whenever appointment data
       changes (for example a live Firestore update). This adds
       a refresh of the slots after it, without editing script.js. */

    function refreshAll() {
        pickers.forEach(picker => picker.render());
    }

    function patchRenderAll() {
        if (typeof renderAll !== "function") return;

        const originalRenderAll = renderAll;

        renderAll = function () {
            const result = originalRenderAll.apply(this, arguments);
            refreshAll();
            return result;
        };
    }


    /* ---------- Start ---------- */

    function init() {

        /* Customer booking form */
        createPicker({
            containerId: "customerTimeSlots",
            timeInputId: "customerAppointmentTime",
            dateInputId: "customerAppointmentDate",
            watchIds: ["customerDentist"],
            getDentist: () => getValue("customerDentist")
        });

        /* Admin: New Appointment modal */
        createPicker({
            containerId: "adminTimeSlots",
            timeInputId: "appointmentTime",
            dateInputId: "appointmentDate",
            watchIds: ["adminDentistInput"],
            modalId: "appointmentModal",
            getDentist: () => getValue("adminDentistInput")
        });

        /* Customer: Reschedule modal (uses the dentist of that appointment) */
        createPicker({
            containerId: "rescheduleTimeSlots",
            timeInputId: "rescheduleTime",
            dateInputId: "rescheduleDate",
            modalId: "rescheduleModal",
            getDentist: () => {
                const id = getValue("rescheduleAppointmentId");

                if (!id || typeof appointments === "undefined") return "";

                const appointment = appointments.find(a => String(a.id) === String(id));
                return appointment ? appointment.dentist : "";
            }
        });

        patchRenderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();