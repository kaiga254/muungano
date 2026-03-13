"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type KycProfile = {
	id: string;
	status: "pending" | "verified" | "rejected" | "not_submitted";
	document_type?: string;
	full_name?: string;
	submitted_at?: string;
	verified_at?: string;
	rejection_reason?: string;
};

const DOC_TYPES = [
	{ value: "national_id", label: "National ID" },
	{ value: "passport", label: "Passport" },
	{ value: "drivers_license", label: "Driver's Licence" },
];

export default function KycPage() {
	const router = useRouter();
	const [profile, setProfile] = useState<KycProfile | null>(null);
	const [loading, setLoading] = useState(true);

	// Form state
	const [documentType, setDocumentType] = useState("national_id");
	const [documentNumber, setDocumentNumber] = useState("");
	const [fullName, setFullName] = useState("");
	const [dateOfBirth, setDateOfBirth] = useState("");
	const [nationality, setNationality] = useState("");
	const [addressLine, setAddressLine] = useState("");

	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadProfile = async () => {
		const res = await fetch("/api/kyc/status");
		if (res.status === 401) { router.push("/login"); return; }
		if (res.ok) {
			const d = (await res.json()) as { profile?: KycProfile | null };
			setProfile(d.profile ?? { id: "", status: "not_submitted" });
		} else {
			setProfile({ id: "", status: "not_submitted" });
		}
		setLoading(false);
	};

	useEffect(() => { void loadProfile(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const res = await fetch("/api/kyc/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fullName,
					nationalId: documentNumber,
					dateOfBirth,
					country: nationality,
				}),
			});
			const d = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(d.error ?? "Failed.");
			await loadProfile();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error.");
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<main className="mx-auto max-w-lg px-4 py-8">
				<p className="text-sm text-muted-foreground">Loading…</p>
			</main>
		);
	}

	const status = profile?.status ?? "not_submitted";

	return (
		<main className="mx-auto w-full max-w-lg px-4 py-8 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Identity Verification</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Complete KYC to unlock higher transaction limits.
				</p>
			</div>

			{status === "verified" && (
				<Card className="border-green-500/40 bg-green-500/5">
					<CardContent className="p-5 flex items-center gap-3">
						<Badge className="bg-green-500/20 text-green-700 dark:text-green-400 text-sm px-3 py-1">
							Tier 1 Verified ✓
						</Badge>
						<span className="text-sm text-muted-foreground">
							Verified on{" "}
							{profile?.verified_at
								? new Date(profile.verified_at).toLocaleDateString()
								: "—"}
						</span>
					</CardContent>
				</Card>
			)}

			{status === "pending" && (
				<Card className="border-yellow-500/40 bg-yellow-500/5">
					<CardContent className="p-5 space-y-1">
						<p className="font-medium">Under Review</p>
						<p className="text-sm text-muted-foreground">
							Your documents are being reviewed. This usually takes 1–2 business days.
						</p>
						<p className="text-xs text-muted-foreground">
							Submitted:{" "}
							{profile?.submitted_at
								? new Date(profile.submitted_at).toLocaleDateString()
								: "—"}
						</p>
					</CardContent>
				</Card>
			)}

			{status === "rejected" && (
				<Card className="border-red-500/40 bg-red-500/5">
					<CardContent className="p-5 space-y-1">
						<p className="font-medium text-destructive">Verification Rejected</p>
						{profile?.rejection_reason && (
							<p className="text-sm text-muted-foreground">{profile.rejection_reason}</p>
						)}
						<p className="text-sm mt-2">Please resubmit with valid documents.</p>
					</CardContent>
				</Card>
			)}

			{(status === "not_submitted" || status === "rejected") && (
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-base">Submit Verification Documents</CardTitle>
					</CardHeader>
					<CardContent>
						<form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
							<div className="grid gap-2">
								<Label>Document Type</Label>
								<select
									value={documentType}
									onChange={(e) => setDocumentType(e.target.value)}
									className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
								>
									{DOC_TYPES.map((d) => (
										<option key={d.value} value={d.value}>{d.label}</option>
									))}
								</select>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="doc-number">Document Number</Label>
								<Input
									id="doc-number"
									value={documentNumber}
									onChange={(e) => setDocumentNumber(e.target.value)}
									placeholder="A12345678"
									required
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="full-name">Full Name (as on document)</Label>
								<Input
									id="full-name"
									value={fullName}
									onChange={(e) => setFullName(e.target.value)}
									placeholder="Jane Doe"
									required
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="dob">Date of Birth</Label>
								<Input
									id="dob"
									type="date"
									value={dateOfBirth}
									onChange={(e) => setDateOfBirth(e.target.value)}
									required
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="nationality">Nationality</Label>
								<Input
									id="nationality"
									value={nationality}
									onChange={(e) => setNationality(e.target.value)}
									placeholder="Kenyan"
									required
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="address">Residential Address</Label>
								<Input
									id="address"
									value={addressLine}
									onChange={(e) => setAddressLine(e.target.value)}
									placeholder="123 Kenyatta Ave, Nairobi"
									required
								/>
							</div>

							{error && <p className="text-sm text-destructive">{error}</p>}

							<Button type="submit" disabled={submitting} className="w-full">
								{submitting ? "Submitting…" : "Submit for Verification"}
							</Button>
						</form>
					</CardContent>
				</Card>
			)}
		</main>
	);
}
