"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signUp(prevState: { error: string } | null, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;

  if (!email || !password || !firstName || !lastName) {
    return { error: "Todos los campos son obligatorios." };
  }

  if (password.length < 6) {
    return { error: "La contrasena debe tener al menos 6 caracteres." };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "Este correo ya esta registrado. Inicia sesion." };
    }
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  if (data.user) {
    const { error: profileError } = await supabase
      .from("teachers")
      .insert({ id: data.user.id, first_name: firstName, last_name: lastName });

    if (profileError) {
      return { error: "No pudimos guardar tu perfil. Intenta de nuevo." };
    }
  }

  redirect("/onboarding/school");
}

export async function signIn(prevState: { error: string } | null, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Correo y contrasena son obligatorios." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Correo o contrasena incorrectos." };
  }

  // Check onboarding state to redirect appropriately
  const { data: school } = await supabase
    .from("schools")
    .select("id")
    .single();

  if (!school) {
    redirect("/onboarding/school");
  }

  const { data: students } = await supabase
    .from("students")
    .select("id")
    .limit(1);

  if (!students || students.length === 0) {
    redirect("/onboarding/students");
  }

  redirect("/dashboard");
}
