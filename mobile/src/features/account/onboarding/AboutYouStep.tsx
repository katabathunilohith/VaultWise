import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Button, PracticeBadge, ScreenSkeleton, Stack, ToggleRow, Txt } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useConnection, useMe } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { confirmAge, useSession } from "@/lib/session";
import { space } from "@/theme";
import { CalmError, CheckRow } from "../controls";
import { StepScreen } from "../layout";
import { CountryField } from "./CountryPicker";
import { getDraft, saveDraft } from "./draft";
import { TextField } from "./TextField";

const backToWelcome = () => (router.canGoBack() ? router.back() : router.replace("/welcome"));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Errors {
  name?: string;
  email?: string;
  country?: string;
  age?: string;
}

/** Onboarding step 1: name, optional email, country, 18+ and whether to start with demo history. */
export function AboutYouStep() {
  const me = useMe();
  const { mode } = useConnection();
  const session = useSession();
  const initial = getDraft();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [country, setCountry] = useState<string | null>(initial.country);
  const [adult, setAdult] = useState(session.ageConfirmed);
  const [demo, setDemo] = useState(initial.demo);
  const [errors, setErrors] = useState<Errors>({});
  const emailRef = useRef<TextInput>(null);

  const countries = me.data?.countries ?? [];
  const region = useQuery({ queryKey: [mode, "region"], queryFn: api.region, staleTime: Infinity, retry: 0 });
  const guess = region.data?.guess;
  const guessOk = !!guess?.country && guess.supported && countries.some((x) => x.code === guess.country);

  // Preselect the server's guess once, if the customer hasn't picked yet.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || country || !guessOk || !guess?.country) return;
    preselected.current = true;
    setCountry(guess.country);
  }, [guessOk, guess, country]);

  const validate = (): Errors => {
    const e: Errors = {};
    const n = name.trim();
    if (n.length < 2) e.name = "Add your name (at least 2 letters).";
    else if (n.length > 60) e.name = "Use 60 characters or fewer.";
    if (email.trim() && !EMAIL.test(email.trim())) e.email = "This doesn't look like an email address.";
    if (!country) e.country = "Choose the country you live in.";
    if (!adult) e.age = "Vaultwise is only for people aged 18 and over.";
    return e;
  };

  const next = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      haptic("error");
      return;
    }
    await confirmAge();
    saveDraft({ name: name.trim(), email: email.trim(), country, demo });
    router.push("/onboarding/pin");
  };

  const countryHint =
    country && guessOk && country === guess?.country && guess?.detail
      ? `Suggested from ${guess.detail}. Change it if that's not right.`
      : "Sets your currency and the rules your vaults follow.";

  return (
    <StepScreen back={backToWelcome} step={{ n: 1, of: 3 }} keyboard footer={<Button label="Continue" onPress={next} armOnMount />}>
      <Stack gap={space.xs}>
        <PracticeBadge />
        <Txt v="headline" accessibilityRole="header">
          About you
        </Txt>
        <Txt v="bodyM" color="textMuted">
          This sets up your account on the Vaultwise server. It takes a minute.
        </Txt>
      </Stack>

      {me.isPending ? (
        <ScreenSkeleton />
      ) : me.isError ? (
        <CalmError error={me.error} onRetry={() => void me.refetch()} title="Couldn't load the country list" />
      ) : (
        <View style={{ gap: space.lg }}>
          <TextField
            label="Your name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
            }}
            placeholder="First and last name"
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            returnKeyType="next"
            maxLength={60}
            onSubmitEditing={() => emailRef.current?.focus()}
            error={errors.name}
          />
          <TextField
            ref={emailRef}
            label="Email (optional)"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            hint="Only for account notices. No marketing unless you turn it on."
            error={errors.email}
          />
          <CountryField
            countries={countries}
            value={country}
            onChange={(code) => {
              setCountry(code);
              if (errors.country) setErrors((x) => ({ ...x, country: undefined }));
            }}
            hint={countryHint}
            error={errors.country}
          />
          <View>
            <CheckRow
              label="I'm 18 or older"
              description="Vaultwise is for adults only."
              checked={adult}
              onChange={(v) => {
                setAdult(v);
                if (v && errors.age) setErrors((x) => ({ ...x, age: undefined }));
              }}
              error={errors.age}
            />
            <ToggleRow
              title="Start with demo history"
              subtitle="Adds sample vaults and four months of practice activity, so there's something to explore."
              value={demo}
              onChange={setDemo}
            />
          </View>
        </View>
      )}
    </StepScreen>
  );
}
