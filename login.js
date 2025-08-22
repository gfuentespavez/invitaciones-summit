import { createClient } from "https://esm.sh/@supabase/supabase-js";

const supabaseUrl = "https://YOUR_PROJECT.supabase.co";
const supabaseKey = "YOUR_PUBLIC_ANON_KEY";
const supabase = createClient(supabaseUrl, supabaseKey);

document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        document.getElementById("login-error").innerText = error.message;
    } else {
        // Usuario logueado
        window.location.href = "/invitaciones.html";
    }
});
