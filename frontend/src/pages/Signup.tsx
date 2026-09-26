import axios from "axios";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/context/AuthContext";
import { AuthLayout } from "@/layouts/AuthLayout";
import { BACKEND_URL } from "@/lib/config";
import { usePageTitle } from "@/hooks/usePageTitle";

interface FormErrors {
    name?: string;
    email?: string;
    password?: string;
    form?: string;
}

export function Signup() {
    usePageTitle("Create your account");
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState<FormErrors>({});
    const [loading, setLoading] = useState(false);

    async function handleSignup(event: React.FormEvent) {
        event.preventDefault();

        const nextErrors: FormErrors = {};
        if (!name.trim()) nextErrors.name = "Enter your name.";
        if (!email.trim()) nextErrors.email = "Enter your email address.";
        else if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "That doesn't look like an email address.";
        if (!password) nextErrors.password = "Choose a password.";
        setErrors(nextErrors);
        if (nextErrors.name || nextErrors.email || nextErrors.password) return;

        setLoading(true);
        try {
            const response = await axios.post(`${BACKEND_URL}/api/auth/signup`, {
                name: name.trim(),
                email: email.trim(),
                password,
            });
            if (response.data.token) {
                localStorage.setItem("token", response.data.token);
            }
            await refresh();
            toast.success("Account created");
            navigate(`/form?userId=${response.data.userId}`);
        } catch (error: any) {
            setErrors({ form: error.response?.data?.msg || "We couldn't create your account. Please try again." });
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthLayout
            title="Create your account."
            subtitle="It takes a minute. Then you set up your interview."
            footer={
                <>
                    Already have an account?{" "}
                    <Link to="/signin" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                        Sign in
                    </Link>
                </>
            }
        >
            <form onSubmit={handleSignup} noValidate className="grid gap-5">
                {errors.form && (
                    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
                        {errors.form}
                    </p>
                )}

                <Field label="Full name" htmlFor="name" error={errors.name}>
                    {(control) => (
                        <Input
                            {...control}
                            type="text"
                            name="name"
                            autoComplete="name"
                            placeholder="Ada Lovelace"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    )}
                </Field>

                <Field label="Email" htmlFor="email" error={errors.email}>
                    {(control) => (
                        <Input
                            {...control}
                            type="email"
                            name="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                    )}
                </Field>

                <Field label="Password" htmlFor="password" error={errors.password}>
                    {(control) => (
                        <PasswordInput
                            {...control}
                            name="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                    )}
                </Field>

                <Button type="submit" size="lg" disabled={loading} className="mt-1 w-full">
                    {loading && <Spinner />}
                    {loading ? "Creating account" : "Create account"}
                </Button>
            </form>
        </AuthLayout>
    );
}
