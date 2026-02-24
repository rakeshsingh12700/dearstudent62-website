import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import AdminShell from "../components/AdminShell";
import { useAuth } from "../context/AuthContext";

const CLASS_OPTIONS = [
  { value: "pre-nursery", label: "Pre Nursery" },
  { value: "nursery", label: "Nursery" },
  { value: "lkg", label: "LKG" },
  { value: "ukg", label: "UKG" },
  { value: "class-1", label: "Class 1" },
  { value: "class-2", label: "Class 2" },
  { value: "class-3", label: "Class 3" },
];

const TYPE_OPTIONS = [
  { value: "worksheet", label: "Worksheet" },
  { value: "exams", label: "Unit Test" },
  { value: "half-year-exam", label: "Half Year" },
  { value: "final-year-exam", label: "Final Year" },
  { value: "bundle", label: "Bundle" },
];

const SUBJECT_OPTIONS = [
  { value: "english", label: "English" },
  { value: "maths", label: "Maths" },
  { value: "evs", label: "EVS" },
  { value: "hindi", label: "Hindi" },
];

const TOPIC_OPTIONS_BY_SUBJECT = {
  english: [
    { value: "reading", label: "Reading" },
    { value: "writing", label: "Writing" },
    { value: "grammar", label: "Grammar" },
    { value: "poems", label: "Poems" },
    { value: "sight-words", label: "Sight Words" },
  ],
  maths: [
    { value: "numbers", label: "Numbers" },
    { value: "addition", label: "Addition" },
    { value: "subtraction", label: "Subtraction" },
    { value: "shapes", label: "Shapes" },
    { value: "measurement", label: "Measurement" },
  ],
  evs: [
    { value: "environment", label: "Environment" },
    { value: "plants", label: "Plants" },
    { value: "animals", label: "Animals" },
    { value: "water", label: "Water" },
    { value: "food", label: "Food" },
  ],
  hindi: [],
};

const GRAMMAR_SUBTOPIC_OPTIONS = [
  { value: "noun", label: "Noun" },
  { value: "pronoun", label: "Pronoun" },
  { value: "verb", label: "Verb" },
  { value: "articles", label: "Articles" },
  { value: "opposites", label: "Opposites" },
  { value: "singular-plural", label: "Singular / Plural" },
  { value: "is-am-are", label: "Is / Am / Are" },
  { value: "prepositions", label: "Prepositions" },
  { value: "adjectives", label: "Adjectives" },
  { value: "have-has-had", label: "Have / Has / Had" },
];

function fileName(file) {
  return file?.name ? String(file.name) : "Not selected";
}

function toUploadDescriptor(file) {
  if (!file) return null;
  return {
    name: String(file.name || "").trim(),
    contentType: String(file.type || "application/octet-stream").trim(),
    size: Number(file.size || 0),
  };
}

async function uploadFileWithSignedUrl(file, signedUpload) {
  if (!file || !signedUpload?.url) return;
  const response = await fetch(signedUpload.url, {
    method: "PUT",
    headers: {
      "Content-Type": signedUpload.contentType || file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Direct upload failed (HTTP ${response.status})`);
  }
}

async function readApiError(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  let data = {};
  let rawErrorText = "";
  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => ({}));
  } else {
    rawErrorText = await response.text().catch(() => "");
  }

  if (response.ok) return { ok: true, data };

  const serverMessage = String(data?.error || "").trim();
  const textMessage = String(rawErrorText || "").trim();
  const looksLikePayloadTooLarge =
    response.status === 413 ||
    /payload too large|request entity too large|FUNCTION_PAYLOAD_TOO_LARGE/i.test(
      textMessage
    );
  const fallback = looksLikePayloadTooLarge
    ? "Upload failed: file size is too large for production API limits."
    : `Upload failed (HTTP ${response.status})`;

  return {
    ok: false,
    error: serverMessage || textMessage || fallback,
  };
}

async function generatePreviewImageFile(pdfFile) {
  if (!pdfFile) return null;

  let pdf = null;
  try {
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc =
        "https://unpkg.com/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs";
    }

    const buffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
    });
    pdf = await loadingTask.promise;

    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = 960;
    const scale = Math.max(maxWidth / Math.max(baseViewport.width, 1), 1);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(Math.ceil(viewport.width), 1);
    canvas.height = Math.max(Math.ceil(viewport.height), 1);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context is unavailable");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("Could not generate preview image"));
      }, "image/png");
    });

    return new File([blob], `${pdfFile.name.replace(/\.pdf$/i, "")}__preview1.png`, {
      type: "image/png",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error("Preview image generation failed in browser:", error);
    return null;
  } finally {
    if (pdf) {
      await pdf.destroy();
    }
  }
}

export default function AdminPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    class: "class-1",
    type: "worksheet",
    title: "",
    price: "",
    subject: "english",
    topic: "",
    subtopic: "",
    showPreviewPage: false,
  });

  const [files, setFiles] = useState({
    pdf: null,
    coverImage: null,
  });
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const showAdminNav = Boolean(user && accessAllowed);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    if (!files.pdf || !files.coverImage) return false;
    if (!String(form.title || "").trim()) return false;
    const price = Number.parseInt(String(form.price || ""), 10);
    if (!Number.isFinite(price) || price <= 0) return false;
    return true;
  }, [files, form]);

  const topicOptions = useMemo(
    () => TOPIC_OPTIONS_BY_SUBJECT[form.subject] || [],
    [form.subject]
  );
  const hideClassSelection = form.subject === "english" && form.type === "worksheet";
  const isGrammarTopic = form.subject === "english" && form.topic === "grammar";

  const onFieldChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      ...(name === "subject" ? { topic: "", subtopic: "" } : {}),
      ...(name === "topic" ? { subtopic: "" } : {}),
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const onFileChange = (event) => {
    const { name, files: selected } = event.target;
    setFiles((prev) => ({
      ...prev,
      [name]: selected?.[0] || null,
    }));
  };

  useEffect(() => {
    if (!user) {
      setAccessAllowed(false);
      setAccessMessage("");
      return;
    }

    let cancelled = false;
    const checkAccess = async () => {
      setCheckingAccess(true);
      setAccessMessage("");
      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok || !payload?.allowed) {
          setAccessAllowed(false);
          setAccessMessage(
            payload?.error ||
              "Your account is logged in but not approved for admin uploads."
          );
          return;
        }

        setAccessAllowed(true);
      } catch {
        if (cancelled) return;
        setAccessAllowed(false);
        setAccessMessage("Unable to verify admin access right now.");
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    };

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const fields = {
        class: hideClassSelection ? "class-1" : form.class,
        type: form.type,
        title: form.title.trim(),
        price: form.price,
        subject: form.subject,
        topic: form.topic || "",
        subtopic: isGrammarTopic ? form.subtopic || "" : "",
        showPreviewPage: String(form.showPreviewPage),
      };

      let previewImage = null;
      if (form.showPreviewPage) {
        try {
          previewImage = await generatePreviewImageFile(files.pdf);
        } catch (previewGenError) {
          console.error("Client preview generation failed; using server fallback.", previewGenError);
        }
      }

      if (!user) {
        throw new Error("Please login as admin before uploading.");
      }
      const idToken = await user.getIdToken();

      let data = null;
      let completed = false;
      try {
        const presignResponse = await fetch("/api/admin/upload-product-presign", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            files: {
              pdf: toUploadDescriptor(files.pdf),
              coverImage: toUploadDescriptor(files.coverImage),
              ...(previewImage ? { previewImage: toUploadDescriptor(previewImage) } : {}),
            },
          }),
        });

        const presignData = await presignResponse.json().catch(() => ({}));
        if (!presignResponse.ok) {
          throw new Error(
            String(presignData?.error || "").trim() || `Upload init failed (HTTP ${presignResponse.status})`
          );
        }

        const uploads = presignData?.uploads || {};
        await uploadFileWithSignedUrl(files.pdf, uploads.pdf);
        await uploadFileWithSignedUrl(files.coverImage, uploads.coverImage);
        if (previewImage && uploads.previewImage) {
          await uploadFileWithSignedUrl(previewImage, uploads.previewImage);
        }

        const finalizeResponse = await fetch("/api/admin/upload-product", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields,
            uploads: {
              pdf: uploads.pdf,
              coverImage: uploads.coverImage,
              ...(previewImage && uploads.previewImage ? { previewImage: uploads.previewImage } : {}),
            },
          }),
        });
        const finalizeResult = await readApiError(finalizeResponse);
        if (!finalizeResult.ok) {
          throw new Error(finalizeResult.error);
        }
        data = finalizeResult.data;
        completed = true;
      } catch (directFlowError) {
        const message = String(directFlowError?.message || directFlowError || "").toLowerCase();
        const shouldFallback =
          /failed to fetch|networkerror|cors|load failed|direct upload failed/.test(message);
        if (!shouldFallback) {
          throw directFlowError;
        }

        const multipart = new FormData();
        multipart.append("class", fields.class);
        multipart.append("type", fields.type);
        multipart.append("title", fields.title);
        multipart.append("price", fields.price);
        multipart.append("subject", fields.subject);
        multipart.append("topic", fields.topic);
        multipart.append("subtopic", fields.subtopic);
        multipart.append("showPreviewPage", fields.showPreviewPage);
        multipart.append("pdf", files.pdf);
        multipart.append("coverImage", files.coverImage);
        if (previewImage) multipart.append("previewImage", previewImage);

        const fallbackResponse = await fetch("/api/admin/upload-product", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          body: multipart,
        });
        const fallbackResult = await readApiError(fallbackResponse);
        if (!fallbackResult.ok) {
          throw new Error(`${fallbackResult.error} (Direct upload fallback failed)`);
        }
        data = fallbackResult.data;
        completed = true;
      }

      if (!completed || !data) {
        throw new Error("Upload failed");
      }

      setResult(data);
      setFiles({ pdf: null, coverImage: null });
      setForm((prev) => ({
        ...prev,
        title: "",
        price: "",
        subtopic: "",
        showPreviewPage: false,
      }));
    } catch (submitError) {
      const message = String(submitError?.message || submitError || "Upload failed");
      if (/failed to fetch/i.test(message)) {
        setError(
          "Upload failed before finalize. If this happened during direct upload, configure R2 CORS to allow PUT from this site."
        );
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="auth-page admin-page">
        <section className="container admin-wrap">
          <AdminShell currentSection={showAdminNav ? "uploads" : "public"}>
            <section className="auth-card admin-card">
              <h1>Admin Upload</h1>
              <p>Upload product PDF and images for listing.</p>
              {!user ? (
                <div className="auth-status auth-status--error">
                  <p>Please login with your admin account to access uploads.</p>
                  <Link href="/auth?next=/admin" className="btn btn-primary auth-status__action">
                    Login to Admin
                  </Link>
                </div>
              ) : (
                <p className="auth-subtext">
                  Logged in as {user.email}
                  {checkingAccess ? " (Checking access...)" : ""}
                </p>
              )}
              {user && !checkingAccess && !accessAllowed && (
                <div className="auth-status auth-status--error">
                  <p>Access denied for this account.</p>
                  <p>{accessMessage}</p>
                </div>
              )}

              {user && checkingAccess && (
                <div className="auth-status">
                  <p>Checking admin access...</p>
                </div>
              )}

              {user && accessAllowed && (
                <form className="auth-form" onSubmit={onSubmit}>
                  <label htmlFor="subject">Subject</label>
                  <select id="subject" name="subject" value={form.subject} onChange={onFieldChange}>
                    {SUBJECT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="type">Type</label>
                  <select id="type" name="type" value={form.type} onChange={onFieldChange}>
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                  {!hideClassSelection ? (
                    <>
                      <label htmlFor="class">Class</label>
                      <select id="class" name="class" value={form.class} onChange={onFieldChange}>
                        {CLASS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <p>Class is auto-set to Class 1 for English Worksheets.</p>
                  )}

                  <label htmlFor="title">Title</label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    value={form.title}
                    onChange={onFieldChange}
                    placeholder="DS62 WK English Grammar Nouns"
                    required
                  />

                  <label htmlFor="price">Price (INR)</label>
                  <input
                    id="price"
                    name="price"
                    type="number"
                    min="1"
                    value={form.price}
                    onChange={onFieldChange}
                    required
                  />

                  <p>Pages are auto-detected from the uploaded PDF.</p>

                  <label htmlFor="topic">Topic (Optional)</label>
                  <select
                    id="topic"
                    name="topic"
                    value={form.topic}
                    onChange={onFieldChange}
                  >
                    <option value="">Select topic (optional)</option>
                    {topicOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isGrammarTopic && (
                    <>
                      <label htmlFor="subtopic">Grammar Subtopic (Optional)</label>
                      <select
                        id="subtopic"
                        name="subtopic"
                        value={form.subtopic}
                        onChange={onFieldChange}
                      >
                        <option value="">Select grammar subtopic (optional)</option>
                        {GRAMMAR_SUBTOPIC_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <label htmlFor="pdf">PDF File (Required)</label>
                  <input
                    id="pdf"
                    name="pdf"
                    type="file"
                    accept="application/pdf"
                    onChange={onFileChange}
                    required
                  />
                  <p>{fileName(files.pdf)}</p>

                  <label htmlFor="coverImage">Cover Thumbnail Image (Required)</label>
                  <input
                    id="coverImage"
                    name="coverImage"
                    type="file"
                    accept="image/*"
                    onChange={onFileChange}
                    required
                  />
                  <p>{fileName(files.coverImage)}</p>

                  <label className="auth-checkbox" htmlFor="showPreviewPage">
                    <input
                      id="showPreviewPage"
                      name="showPreviewPage"
                      type="checkbox"
                      checked={form.showPreviewPage}
                      onChange={onFieldChange}
                    />
                    Show First-Page Image of the uploaded pdf in Preview Modal
                  </label>
                  <p>
                    If enabled, users will see cover image + first-page image in preview. First-page
                    image is auto-generated from the uploaded PDF.
                  </p>

                  <button type="submit" className="btn btn-primary" disabled={!canSubmit || submitting}>
                    {submitting ? "Uploading..." : "Upload to R2 Cloud"}
                  </button>
                </form>
              )}

              {error && <p className="auth-status auth-status--error">{error}</p>}

              {result?.ok && (
                <div className="auth-status auth-status--ok">
                  <p>{result.message}</p>
                  <p>
                    PDF: <code>{result?.storage?.pdfKey}</code>
                  </p>
                  <p>
                    Cover: <code>{result?.storage?.coverKey}</code>
                  </p>
                  {result?.storage?.previewKey && (
                    <p>
                      Preview: <code>{result.storage.previewKey}</code>
                    </p>
                  )}
                  <p>
                    Meta: <code>{result?.storage?.metaKey}</code>
                  </p>
                  <p>{result.nextStep}</p>
                </div>
              )}
            </section>
          </AdminShell>
        </section>
      </main>
    </>
  );
}
