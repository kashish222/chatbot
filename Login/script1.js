


function goToPage(relativePath) {
    window.location.href = new URL(relativePath, window.location.href).href;
}

document.addEventListener('DOMContentLoaded', () => {

    const wrapper = document.querySelector('.wrapper');
    const registerLink = document.querySelector('.login-register');
    const registerLoginLink = document.querySelector('.register .login-link');
    const btnPopup = document.querySelector('.btnLogin-popup');
    const sidebarLoginLink = document.querySelector('.sidebar-login-link');

    const homeLinks = document.querySelectorAll('.home-link');
    const aboutLinks = document.querySelectorAll('.about-link');
    const contactLinks = document.querySelectorAll('.contact-link');

    const homeSection = document.querySelector('.home-section');
    const aboutSection = document.querySelector('.about-section');
    const contactSection = document.querySelector('.contact-section');

    const closeButtons = document.querySelectorAll('.btnClose');
    const sidebar = document.querySelector('.sidebar');

    function showLogin() {
        closeAllSections();
        wrapper.classList.add('active-popup');
        wrapper.classList.remove('active');
        clearForms();
        hideSidebar();
    }

    function hideLogin() {
        wrapper.classList.remove('active-popup');
        wrapper.classList.remove('active');
        showSidebar();
    }

    btnPopup.addEventListener('click', () => {
        if (wrapper.classList.contains('active-popup')) {
            hideLogin();
        } else {
            showLogin();
        }
    });

    sidebarLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });

    registerLink.addEventListener('click', (e) => {
        e.preventDefault();
        wrapper.classList.add('active');
        clearForms();
        hideSidebar();
    });

    registerLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        wrapper.classList.remove('active');
        clearForms();
    });

    // =========================
    // REGISTER (API CALL)
    // =========================
    const registerForm = document.querySelector('.register form');
    const usernameInput = registerForm.querySelector('input[type="text"]');
    const passwordInput = registerForm.querySelector('input[type="password"]');
    const emailInput = registerForm.querySelector('input[type="email"]');
    const termsCheckbox = registerForm.querySelector('input[type="checkbox"]');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value;
        const password = passwordInput.value;
        const email = emailInput.value;
        const termsAccepted = termsCheckbox.checked;

        if (!username || !password || !email) {
            alert("Please fill in all fields.");
            return;
        }

        if (!termsAccepted) {
            alert("You must agree to the terms and conditions.");
            return;
        }

        if (!validatePassword(password)) return;

        try {
            const res = await fetch("http://localhost:3000/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password })
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.message || "Registration failed");
                return;
            }

            alert(data.message);
            wrapper.classList.remove('active');

        } catch (err) {
            alert("Server error: " + err.message);
        }
    });

    // =========================
    // LOGIN (API CALL)
    // =========================
    const loginForm = document.querySelector('.login form');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username =
            loginForm.querySelector('input[type="text"]').value;

        const password =
            loginForm.querySelector('input[type="password"]').value;

        if (!username || !password) {
            alert("Please fill in both fields.");
            return;
        }

        try {
            const res = await fetch("http://localhost:3000/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.message || "Login failed");
                return;
            }

            // Save JWT token
            localStorage.setItem("token", data.token);

            alert("Login successful!");
            goToPage('../Chatbot/index.html');

        } catch (err) {
            alert("Server error: " + err.message);
        }
    });

    // =========================
// FORGOT PASSWORD (API CALL)
// =========================
const forgotPasswordLink =
    document.querySelector('.login .remember-forgot a');

forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();

    const username = prompt("Enter your username:");

    if (!username) {
        alert("Username is required.");
        return;
    }

    const newPassword = prompt("Enter your new password:");

    if (!newPassword) {
        alert("Password cannot be empty.");
        return;
    }

    if (!validatePassword(newPassword)) {
        return;
    }

    try {
        const res = await fetch("http://localhost:3000/forgot-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                newPassword
            })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.message || "Password reset failed.");
            return;
        }

        alert(data.message);

    } catch (err) {
        alert("Server error: " + err.message);
    }
});

    // =========================
    // PASSWORD VALIDATION
    // =========================
    function validatePassword(password) {
        if (password.length < 8) {
            alert("Password must be at least 8 characters long.");
            return false;
        }

        if (!/[A-Z]/.test(password)) {
            alert("Password must contain at least one uppercase letter.");
            return false;
        }

        if (!/[!@#$%^&*(),.?\":{}|<>]/.test(password)) {
            alert("Password must contain at least one special character.");
            return false;
        }

        return true;
    }

    // =========================
    // NAVIGATION
    // =========================
    function closeAllSections() {
        document.querySelectorAll('.section').forEach(sec => {
            sec.classList.remove('active-section');
        });
    }

    function toggleSection(section) {
        closeAllSections();
        hideSidebar();
        section.classList.add('active-section');
    }

    homeLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            hideLogin();
            toggleSection(homeSection);
        });
    });

    aboutLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            hideLogin();
            toggleSection(aboutSection);
        });
    });

    contactLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            hideLogin();
            toggleSection(contactSection);
        });
    });

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            button.parentElement.classList.remove('active-section');
            showSidebar();
        });
    });

    function clearForms() {
        document.querySelectorAll('form').forEach(form => {
            form.reset();
            form.querySelectorAll('.username-error, .email-error').forEach(msg => {
                msg.textContent = '';
            });
        });
    }

    function hideSidebar() {
        sidebar.classList.add('hidden');
    }

    function showSidebar() {
        if (!wrapper.classList.contains('active-popup')) {
            sidebar.classList.remove('hidden');
        }
    }

});