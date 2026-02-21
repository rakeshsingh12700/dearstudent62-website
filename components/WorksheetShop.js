import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import staticProducts from "../data/products";
import {
  getPreviewUrl,
  getThumbnailUrl,
} from "../lib/productAssetUrls";
import { formatMoney, getPriceAmount, getPriceCurrency, readCurrencyPreference } from "../lib/pricing/client";
import { buildRatingStars, formatRatingAverage, normalizeRatingStats } from "../lib/productRatings";
import { getSubjectBadgeClass, getSubjectLabel } from "../lib/subjectBadge";

const CLASS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pre-nursery", label: "PreN" },
  { value: "nursery", label: "Nursery" },
  { value: "lkg", label: "LKG" },
  { value: "ukg", label: "UKG" },
  { value: "class-1", label: "C1" },
  { value: "class-2", label: "C2" },
  { value: "class-3", label: "C3" }
];

const SUBJECT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "english", label: "English" },
  { value: "maths", label: "Maths" },
  { value: "evs", label: "EVS" }
];

const TYPE_OPTIONS = [
  { value: "worksheet", label: "Worksheet" },
  { value: "exams", label: "UnitTest" },
  { value: "half-year-exam", label: "HalfYear" },
  { value: "final-year-exam", label: "Final" },
  { value: "bundle", label: "Bundle" }
];

const SORT_OPTIONS = [
  { value: "default", label: "Sort by" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "title", label: "Title: A-Z" }
];

const TOPIC_OPTIONS_BY_SUBJECT = {
  english: [
    { value: "reading", label: "Reading" },
    { value: "writing", label: "Writing" },
    { value: "grammar", label: "Grammar" },
    { value: "poems", label: "Poems" },
    { value: "sight-words", label: "Sight Words" }
  ],
  maths: [
    { value: "numbers", label: "Numbers" },
    { value: "addition", label: "Addition" },
    { value: "subtraction", label: "Subtraction" },
    { value: "shapes", label: "Shapes" },
    { value: "measurement", label: "Measurement" }
  ],
  evs: [
    { value: "environment", label: "Environment" },
    { value: "plants", label: "Plants" },
    { value: "animals", label: "Animals" },
    { value: "water", label: "Water" },
    { value: "food", label: "Food" }
  ]
};

const GRAMMAR_SUBTOPIC_OPTIONS = [
  { value: "noun", label: "Noun" },
  { value: "pronoun", label: "Pronoun" },
  { value: "verb", label: "Verb" },
  { value: "articles", label: "Articles" },
  { value: "opposites", label: "Opposites" },
  { value: "singular-plural", label: "Singular/Plural" },
  { value: "is-am-are", label: "Is/Am/Are" },
  { value: "prepositions", label: "Prepositions" },
  { value: "adjectives", label: "Adjectives" },
  { value: "have-has-had", label: "Have/Has/Had" }
];

const SUBJECT_PATTERNS = {
  english: [/\benglish\b/i],
  maths: [/\bmaths?\b/i, /\bmathematics\b/i, /\baddition\b/i, /\bsubtraction\b/i],
  evs: [/\bevs\b/i, /\benvironment(al)? studies\b/i, /\benvironment\b/i]
};

const TOPIC_PATTERNS = {
  reading: [/\breading\b/i],
  writing: [/\bwriting\b/i],
  grammar: [/\bgrammar\b/i],
  poems: [/\bpoems?\b/i, /\bpoetry\b/i],
  "sight-words": [/\bsight\s*words?\b/i],
  numbers: [/\bnumbers?\b/i],
  addition: [/\baddition\b/i],
  subtraction: [/\bsubtraction\b/i],
  shapes: [/\bshapes?\b/i],
  measurement: [/\bmeasurement\b/i],
  environment: [/\benvironment\b/i],
  plants: [/\bplants?\b/i],
  animals: [/\banimals?\b/i],
  water: [/\bwater\b/i],
  food: [/\bfood\b/i]
};

const SUBTOPIC_PATTERNS = {
  noun: [/\bnouns?\b/i],
  pronoun: [/\bpronouns?\b/i],
  verb: [/\bverbs?\b/i],
  articles: [/\barticles?\b/i],
  opposites: [/\bopposites?\b/i],
  "singular-plural": [/\bsingular\b/i, /\bplural\b/i],
  "is-am-are": [/\bis\s*\/\s*am\s*\/\s*are\b/i],
  prepositions: [/\bprepositions?\b/i],
  adjectives: [/\badjectives?\b/i],
  "have-has-had": [/\bhave\b/i, /\bhas\b/i, /\bhad\b/i]
};

const TYPE_ALIASES = {
  worksheet: "worksheet",
  worksheets: "worksheet",
  exams: "exams",
  "unit-test": "exams",
  unittest: "exams",
  "half-year-exam": "half-year-exam",
  "half-year": "half-year-exam",
  "final-year-exam": "final-year-exam",
  final: "final-year-exam",
  bundle: "bundle",
  all: "all"
};

const CART_STORAGE_KEY = "ds-worksheet-cart-v1";

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toLabel(slug) {
  return String(slug || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeType(value) {
  return TYPE_ALIASES[toSlug(value)] || toSlug(value);
}

function normalizeMobileView(value) {
  const slug = toSlug(value);
  if (slug === "class" || slug === "classes") return "classes";
  if (slug === "english") return "english";
  if (slug === "maths") return "maths";
  if (slug === "exam" || slug === "exams") return "exams";
  return "library";
}

const TOPIC_VALUES_BY_SUBJECT = Object.fromEntries(
  Object.entries(TOPIC_OPTIONS_BY_SUBJECT).map(([subject, options]) => [
    subject,
    new Set(options.map((option) => option.value)),
  ])
);

const GRAMMAR_SUBTOPIC_VALUES = new Set(
  GRAMMAR_SUBTOPIC_OPTIONS.map((option) => option.value)
);

function normalizeFilterState(state) {
  return {
    class: toSlug(state?.class) || "all",
    type: normalizeType(state?.type) || "all",
    subject: toSlug(state?.subject) || "all",
    topic: toSlug(state?.topic) || "all",
    subtopic: toSlug(state?.subtopic) || "all",
    view: normalizeMobileView(state?.view),
    sort: toSlug(state?.sort) || "default",
  };
}

function sanitizeFilterState(state) {
  const next = normalizeFilterState(state);

  if (next.type === "exams") {
    next.topic = "all";
    next.subtopic = "all";
  }

  if (next.subject === "all") {
    next.topic = "all";
    next.subtopic = "all";
  }

  if (next.subject !== "all" && next.topic !== "all") {
    const validTopics = TOPIC_VALUES_BY_SUBJECT[next.subject];
    if (!validTopics || !validTopics.has(next.topic)) {
      next.topic = "all";
      next.subtopic = "all";
    }
  }

  if (next.topic !== "grammar") {
    next.subtopic = "all";
  } else if (next.subtopic !== "all" && !GRAMMAR_SUBTOPIC_VALUES.has(next.subtopic)) {
    next.subtopic = "all";
  }

  if (next.type === "exams") next.view = "exams";
  else if (next.subject === "english") next.view = "english";
  else if (next.subject === "maths") next.view = "maths";
  else next.view = "classes";

  return next;
}

function reduceFilterState(currentState, event) {
  const state = normalizeFilterState(currentState);
  switch (event.type) {
    case "TAB_CLASSES":
      return {
        ...state,
        subject: "all",
        type: "all",
        topic: "all",
        subtopic: "all",
        view: "classes",
      };
    case "TAB_ENGLISH":
      return {
        ...state,
        subject: "english",
        type: "all",
        topic: "all",
        subtopic: "all",
        view: "english",
      };
    case "TAB_MATHS":
      return {
        ...state,
        subject: "maths",
        type: "all",
        topic: "all",
        subtopic: "all",
        view: "maths",
      };
    case "TAB_EXAMS":
      return {
        ...state,
        subject: "all",
        type: "exams",
        topic: "all",
        subtopic: "all",
        view: "exams",
      };
    case "SET_CLASS":
      return { ...state, class: toSlug(event.value) || "all" };
    case "SET_SUBJECT":
      return { ...state, subject: toSlug(event.value) || "all" };
    case "SET_TYPE":
      return { ...state, type: normalizeType(event.value) || "all" };
    case "SET_TOPIC":
      return { ...state, topic: toSlug(event.value) || "all" };
    case "SET_SUBTOPIC":
      return { ...state, subtopic: toSlug(event.value) || "all" };
    case "SET_SORT":
      return { ...state, sort: toSlug(event.value) || "default" };
    case "CLEAR_FILTERS": {
      return {
        ...state,
        class: "all",
        subject: "all",
        type: "all",
        topic: "all",
        subtopic: "all",
        view: "classes",
      };
    }
    default:
      return state;
  }
}

function matchFirstKey(patternMap, sourceText) {
  return Object.keys(patternMap).find((key) =>
    patternMap[key].some((pattern) => pattern.test(sourceText))
  );
}

function inferTaxonomy(product) {
  const sourceText = [
    product?.subject,
    product?.topic,
    product?.subtopic,
    product?.subcategory,
    product?.title,
    product?.category,
    product?.type
  ]
    .filter(Boolean)
    .join(" ");

  const explicitSubject = toSlug(product?.subject);
  const inferredSubject = explicitSubject || matchFirstKey(SUBJECT_PATTERNS, sourceText) || "evs";

  const explicitTopic = toSlug(product?.topic);
  const inferredTopic = explicitTopic || matchFirstKey(TOPIC_PATTERNS, sourceText);

  const explicitSubtopic = toSlug(product?.subtopic);
  const detectedSubtopics = Object.keys(SUBTOPIC_PATTERNS).filter((key) =>
    SUBTOPIC_PATTERNS[key].some((pattern) => pattern.test(sourceText))
  );
  const subtopics = explicitSubtopic
    ? Array.from(new Set([explicitSubtopic, ...detectedSubtopics]))
    : detectedSubtopics;

  let finalTopic = inferredTopic;
  if (!finalTopic && subtopics.length > 0) {
    finalTopic = "grammar";
  }

  if (!finalTopic) {
    if (inferredSubject === "english") finalTopic = "reading";
    else if (inferredSubject === "maths") finalTopic = "numbers";
    else finalTopic = "environment";
  }

  return {
    subject: inferredSubject,
    topic: finalTopic,
    subtopics
  };
}

function getOptionLabel(options, value) {
  return options.find((item) => item.value === value)?.label || toLabel(value);
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DropdownSelect({ value, options, onChange, className = "", ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selectedLabel =
    options.find((option) => option.value === value)?.label ||
    options.find((option) => option.value === String(value))?.label ||
    "Select";

  useEffect(() => {
    if (!open) return undefined;

    const handleOutside = (event) => {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  return (
    <div className={`ds-select ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="ds-select__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || selectedLabel}
      >
        <span>{selectedLabel}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="ds-select__menu" role="listbox" aria-label={ariaLabel || "Select option"}>
          {options.map((option) => (
            <button
              key={`dd-${option.value}`}
              type="button"
              className={`ds-select__option ${String(option.value) === String(value) ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={String(option.value) === String(value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M15.0102 3.39975L19.7695 7.60782C20.6566 8.39207 21.3816 9.03306 21.8774 9.61267C22.395 10.2176 22.75 10.8531 22.75 11.6327C22.75 12.4122 22.395 13.0477 21.8774 13.6527C21.3816 14.2323 20.6566 14.8733 19.7696 15.6575L15.0101 19.8656C14.6238 20.2073 14.2737 20.5169 13.974 20.7137C13.6785 20.9078 13.184 21.1599 12.6363 20.9153C12.0868 20.6698 11.9466 20.1315 11.8959 19.7815C11.8446 19.4273 11.8446 18.961 11.8447 18.4471L11.8447 16.4191C10.0727 16.5216 8.26985 16.9819 6.69743 17.744C4.89831 18.616 3.45132 19.8572 2.66328 21.3502C2.50236 21.6551 2.15431 21.811 1.81967 21.7281C1.48503 21.6452 1.25 21.3449 1.25 21.0001C1.25 15.4966 2.86837 11.9338 5.16167 9.75118C7.20044 7.81083 9.69493 7.03571 11.8447 6.89302V4.87269C11.8447 4.85449 11.8447 4.83634 11.8447 4.81825C11.8446 4.30437 11.8446 3.83799 11.8959 3.48381C11.9466 3.13387 12.0868 2.59554 12.6363 2.35008C13.184 2.10545 13.6785 2.35755 13.974 2.55163C14.2738 2.74848 14.6238 3.05806 15.0102 3.39975ZM13.3571 3.95726C13.5307 4.09508 13.7528 4.29022 14.0572 4.5594L18.7333 8.69388C19.6735 9.5251 20.3181 10.0974 20.7376 10.5878C21.1434 11.0621 21.25 11.3606 21.25 11.6327C21.25 11.9048 21.1434 12.2033 20.7376 12.6776C20.3181 13.168 19.6735 13.7402 18.7333 14.5715L14.0572 18.7059C13.7528 18.9751 13.5307 19.1703 13.3571 19.3081C13.3456 19.0884 13.3447 18.7952 13.3447 18.3926V15.6473C13.3447 15.2331 13.0089 14.8973 12.5947 14.8973C10.3638 14.8973 8.04463 15.4242 6.04321 16.3942C4.85692 16.9692 3.76443 17.709 2.86794 18.6031C3.26004 14.8062 4.58671 12.3691 6.19578 10.8377C8.13314 8.9939 10.5792 8.36804 12.5947 8.36804C13.0089 8.36804 13.3447 8.03226 13.3447 7.61804V4.87269C13.3447 4.47017 13.3456 4.17694 13.3571 3.95726Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M14 8h3V4h-3c-3 0-5 2-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.6.4-1 1-1z"
        fill="currentColor"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M12 4a8 8 0 0 0-6.9 12l-.8 4 4.1-.8A8 8 0 1 0 12 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9.2c.3-.7.7-.7 1-.7h.3c.1 0 .3 0 .4.3l.8 1.8c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5.3.4 1.1 1.7 2.7 2.3.2.1.4 0 .5-.1l.6-.7c.1-.1.3-.2.5-.1l1.7.8c.2.1.3.2.3.4v.3c0 .3-.1.7-.7 1-.6.3-1.2.5-2 .3-1.1-.3-2.5-1-3.7-2.2-1.3-1.2-2.1-2.7-2.3-3.8-.1-.8.1-1.4.4-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function CopyLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M10 14l4-4m-6 8H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h1m8 0h1a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1m-6-8h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function WorksheetShop({
  initialClass = "all",
  initialType = "all",
  initialSubject = "all",
  initialTopic = "all",
  initialSubtopic = "all",
  initialSort = "default",
  initialOpenCart = false,
  initialMobileView = "library"
}) {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [currencyRefreshKey, setCurrencyRefreshKey] = useState(0);
  const [selectedClass, setSelectedClass] = useState(toSlug(initialClass) || "all");
  const [selectedType, setSelectedType] = useState(normalizeType(initialType) || "all");
  const [selectedSubject, setSelectedSubject] = useState(toSlug(initialSubject) || "all");
  const [selectedTopic, setSelectedTopic] = useState(toSlug(initialTopic) || "all");
  const [selectedSubtopic, setSelectedSubtopic] = useState(toSlug(initialSubtopic) || "all");
  const [mobileView, setMobileView] = useState(() => {
    const explicit = normalizeMobileView(initialMobileView);
    if (explicit !== "library") return explicit;
    if (selectedType !== "all" && selectedType !== "worksheet" && selectedType !== "bundle") {
      return "exams";
    }
    if (selectedSubject === "english") return "english";
    if (selectedSubject === "maths") return "maths";
    return "classes";
  });
  const [sortBy, setSortBy] = useState(toSlug(initialSort) || "default");
  const [isCartOpen, setIsCartOpen] = useState(initialOpenCart);
  const [desktopOpen, setDesktopOpen] = useState({
    class: true,
    subject: true,
    topic: true,
    subtopic: true,
    type: true,
  });
  const [previewState, setPreviewState] = useState(null);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const [shareMenuProductId, setShareMenuProductId] = useState("");
  const [shareStatus, setShareStatus] = useState({ productId: "", message: "" });
  const [isAndroidDevice] = useState(() => {
    if (typeof window === "undefined") return false;
    const ua = String(window.navigator?.userAgent || "");
    const platform = String(window.navigator?.platform || "");
    const maxTouchPoints = Number(window.navigator?.maxTouchPoints || 0);
    const isAndroidUa = /android/i.test(ua);
    const isDesktopPlatform = /mac|win/i.test(platform);
    return isAndroidUa && !isDesktopPlatform && maxTouchPoints > 0;
  });
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return [];
    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!savedCart) return [];
    try {
      const parsed = JSON.parse(savedCart);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("ds-cart-updated"));
  }, [cart]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const closeOnOutside = () => {
      setShareMenuProductId("");
      setShareStatus({ productId: "", message: "" });
    };
    window.addEventListener("click", closeOnOutside);
    return () => {
      window.removeEventListener("click", closeOnOutside);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openCart = () => setIsCartOpen(true);
    window.addEventListener("ds-open-cart", openCart);
    return () => {
      window.removeEventListener("ds-open-cart", openCart);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncCurrency = () => setCurrencyRefreshKey((value) => value + 1);
    window.addEventListener("ds-currency-updated", syncCurrency);
    return () => {
      window.removeEventListener("ds-currency-updated", syncCurrency);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      if (!cancelled) setProductsLoaded(false);
      try {
        const preferredCurrency = readCurrencyPreference();
        const response = await fetch(
          `/api/products${preferredCurrency ? `?currency=${encodeURIComponent(preferredCurrency)}` : ""}`
        );
        if (!response.ok) {
          if (!cancelled) {
            setProducts(staticProducts);
            setProductsLoaded(true);
          }
          return;
        }
        const payload = await response.json().catch(() => ({}));
        const runtimeProducts = Array.isArray(payload?.products) ? payload.products : [];
        if (!cancelled) {
          setProducts(runtimeProducts);
          setProductsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setProducts(staticProducts);
          setProductsLoaded(true);
        }
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [currencyRefreshKey]);

  const taxonomyById = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      map.set(product.id, inferTaxonomy(product));
    });
    return map;
  }, [products]);

  const normalizedTypeById = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      map.set(product.id, normalizeType(product.type));
    });
    return map;
  }, [products]);

  const isGrammarTopic = selectedTopic === "grammar";
  const activeTab = useMemo(() => {
    if (selectedType === "exams") return "exams";
    if (selectedSubject === "english") return "english";
    if (selectedSubject === "maths") return "maths";
    return "classes";
  }, [selectedSubject, selectedType]);

  const buildCurrentFilterState = () => ({
    class: selectedClass,
    type: selectedType,
    subject: selectedSubject,
    topic: selectedTopic,
    subtopic: selectedSubtopic,
    view: mobileView,
    sort: sortBy,
  });

  useEffect(() => {
    const next = sanitizeFilterState({
      class: initialClass,
      type: initialType,
      subject: initialSubject,
      topic: initialTopic,
      subtopic: initialSubtopic,
      view: initialMobileView,
      sort: initialSort,
    });

    if (
      next.class === selectedClass &&
      next.type === selectedType &&
      next.subject === selectedSubject &&
      next.topic === selectedTopic &&
      next.subtopic === selectedSubtopic &&
      next.view === mobileView &&
      next.sort === sortBy
    ) {
      return;
    }

    setSelectedClass(next.class);
    setSelectedType(next.type);
    setSelectedSubject(next.subject);
    setSelectedTopic(next.topic);
    setSelectedSubtopic(next.subtopic);
    setMobileView(next.view);
    setSortBy(next.sort);
  }, [
    initialClass,
    initialType,
    initialSubject,
    initialTopic,
    initialSubtopic,
    initialMobileView,
    initialSort,
    mobileView,
    selectedClass,
    selectedSubject,
    selectedSubtopic,
    selectedTopic,
    selectedType,
    sortBy,
  ]);

  const applyFilterState = (nextState) => {
    const sanitized = sanitizeFilterState(nextState);
    setSelectedClass(sanitized.class);
    setSelectedType(sanitized.type);
    setSelectedSubject(sanitized.subject);
    setSelectedTopic(sanitized.topic);
    setSelectedSubtopic(sanitized.subtopic);
    setMobileView(sanitized.view);
    setSortBy(sanitized.sort);

    const nextQuery = {};
    if (sanitized.class !== "all") nextQuery.class = sanitized.class;
    if (sanitized.type !== "all") nextQuery.type = sanitized.type;
    if (sanitized.subject !== "all") nextQuery.subject = sanitized.subject;
    if (sanitized.topic !== "all") nextQuery.topic = sanitized.topic;
    if (sanitized.subtopic !== "all") nextQuery.subtopic = sanitized.subtopic;
    if (sanitized.view !== "library") nextQuery.view = sanitized.view;
    if (sanitized.sort !== "default") nextQuery.sort = sanitized.sort;

    router.replace(
      {
        pathname: "/worksheets",
        query: nextQuery,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  const applyFilterAction = (event) => {
    const reduced = reduceFilterState(buildCurrentFilterState(), event);
    applyFilterState(reduced);
  };

  const dynamicSubjectOptions = useMemo(() => {
    const values = new Set();

    products.forEach((product) => {
      const classMatch = selectedClass === "all" || product.class === selectedClass;
      const typeMatch =
        selectedType === "all" || normalizedTypeById.get(product.id) === selectedType;
      if (!classMatch || !typeMatch) return;

      const taxonomy = taxonomyById.get(product.id);
      if (taxonomy?.subject) values.add(taxonomy.subject);
    });

    const predefined = SUBJECT_OPTIONS.filter((item) => item.value !== "all");
    const dynamic = Array.from(values)
      .filter((value) => value !== "all")
      .map((value) => ({ value, label: toLabel(value) }));

    const byValue = new Map();
    [...predefined, ...dynamic].forEach((item) => byValue.set(item.value, item));

    return [{ value: "all", label: "All" }, ...Array.from(byValue.values())];
  }, [products, selectedClass, selectedType, taxonomyById]);

  const topicOptions = useMemo(() => {
    if (selectedSubject === "all") return [{ value: "all", label: "All" }];

    const predefined = TOPIC_OPTIONS_BY_SUBJECT[selectedSubject] || [];
    const dynamicValues = new Set();

    products.forEach((product) => {
      const taxonomy = taxonomyById.get(product.id);
      if (!taxonomy) return;

      const classMatch = selectedClass === "all" || product.class === selectedClass;
      const typeMatch =
        selectedType === "all" || normalizedTypeById.get(product.id) === selectedType;
      const subjectMatch = taxonomy.subject === selectedSubject;
      if (!classMatch || !typeMatch || !subjectMatch) return;

      dynamicValues.add(taxonomy.topic);
    });

    const dynamic = Array.from(dynamicValues)
      .filter(Boolean)
      .map((value) => ({ value, label: toLabel(value) }));

    const byValue = new Map();
    [...predefined, ...dynamic].forEach((item) => byValue.set(item.value, item));

    return [{ value: "all", label: "All" }, ...Array.from(byValue.values())];
  }, [products, selectedClass, selectedSubject, selectedType, taxonomyById]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const taxonomy = taxonomyById.get(product.id);
      const classMatch = selectedClass === "all" || product.class === selectedClass;
      const typeMatch =
        selectedType === "all" || normalizedTypeById.get(product.id) === selectedType;
      const subjectMatch = selectedSubject === "all" || taxonomy?.subject === selectedSubject;
      const topicMatch = selectedTopic === "all" || taxonomy?.topic === selectedTopic;
      const subtopicMatch =
        !isGrammarTopic ||
        selectedSubtopic === "all" ||
        (Array.isArray(taxonomy?.subtopics) && taxonomy.subtopics.includes(selectedSubtopic));

      return classMatch && typeMatch && subjectMatch && topicMatch && subtopicMatch;
    });

    const sorted = [...filtered];
    if (sortBy === "price-low") {
      sorted.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-high") {
      sorted.sort((a, b) => b.price - a.price);
    } else if (sortBy === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [
    products,
    isGrammarTopic,
    normalizedTypeById,
    selectedClass,
    selectedSubtopic,
    selectedSubject,
    selectedTopic,
    selectedType,
    sortBy,
    taxonomyById,
  ]);
  const visibleCount = Math.max(Number(visibleProducts.length || 0), 0);
  const visibleRangeStart = visibleCount > 0 ? 1 : 0;
  const visibleRangeEnd = visibleCount;

  const selectedPathLabel = useMemo(() => {
    const path = [];
    if (selectedClass !== "all") {
      path.push(getOptionLabel(CLASS_OPTIONS, selectedClass));
    }
    if (selectedSubject !== "all") {
      path.push(getOptionLabel(dynamicSubjectOptions, selectedSubject));
    }
    if (selectedTopic !== "all") {
      path.push(getOptionLabel(topicOptions, selectedTopic));
    }
    if (selectedSubtopic !== "all") {
      path.push(getOptionLabel(GRAMMAR_SUBTOPIC_OPTIONS, selectedSubtopic));
    }
    return path.join(" > ");
  }, [dynamicSubjectOptions, selectedClass, selectedSubject, selectedSubtopic, selectedTopic, topicOptions]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.price, 0),
    [cart]
  );
  const cartCurrency = useMemo(
    () => String(cart[0]?.currency || "INR").toUpperCase(),
    [cart]
  );

  const cartQuantityById = useMemo(
    () => new Map(cart.map((item) => [item.id, item.quantity])),
    [cart]
  );

  const updateCartItem = (product, delta) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (!existing && delta > 0) {
        return [...prev, { ...product, quantity: 1 }];
      }
      if (!existing) return prev;

      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((item) => item.id !== product.id);
      }

      return prev.map((item) =>
        item.id === product.id ? { ...item, quantity: nextQty } : item
      );
    });
  };

  const clearCart = () => setCart([]);

  const getItemQuantity = (productId) => cartQuantityById.get(productId) || 0;

  const openQuickPreview = (product) => {
    const url = getPreviewUrl(product?.storageKey, 1);
    if (!url) return;
    setPreviewLoadFailed(false);
    setPreviewState(product);
  };

  const getProductShareUrl = (productId) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/product/${encodeURIComponent(productId)}`;
  };

  const copyText = async (text) => {
    if (!text) return false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      return true;
    } catch {
      return false;
    }
  };

  const openShareMenu = async (event, product) => {
    event.stopPropagation();
    const url = getProductShareUrl(product?.id);
    if (!url) return;

    setShareStatus({ productId: "", message: "" });
    setShareMenuProductId((prev) => (prev === product.id ? "" : product.id));
  };

  const shareToInstagram = async (event, product) => {
    event.stopPropagation();
    const url = getProductShareUrl(product?.id);
    if (!url) return;
    const copied = await copyText(url);
    setShareStatus({
      productId: product?.id || "",
      message: copied ? "Link copied. Paste in Instagram." : "Could not copy link.",
    });
    if (typeof window !== "undefined") {
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    }
    setShareMenuProductId("");
  };

  const shareToFacebook = (event, product) => {
    event.stopPropagation();
    const url = encodeURIComponent(getProductShareUrl(product?.id));
    if (!url || typeof window === "undefined") return;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareMenuProductId("");
  };

  const shareToWhatsApp = (event, product) => {
    event.stopPropagation();
    const url = getProductShareUrl(product?.id);
    if (!url || typeof window === "undefined") return;
    const text = encodeURIComponent(`${product.title} - ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    setShareMenuProductId("");
  };

  const shareCopyLink = async (event, product) => {
    event.stopPropagation();
    const url = getProductShareUrl(product?.id);
    const copied = await copyText(url);
    setShareStatus({
      productId: product?.id || "",
      message: copied ? "Link copied." : "Could not copy link.",
    });
    setShareMenuProductId("");
  };

  const mobileFilterMode = activeTab;

  const mobileFilters = useMemo(() => {
    if (mobileFilterMode === "english") {
      return [
        {
          key: "topic",
          label: "Topics",
          value: selectedTopic,
          onChange: (value) => applyFilterAction({ type: "SET_TOPIC", value }),
          options: topicOptions,
        },
        {
          key: "type",
          label: "Type",
          value: selectedType,
          onChange: (value) => applyFilterAction({ type: "SET_TYPE", value }),
          options: [{ value: "all", label: "All" }, ...TYPE_OPTIONS],
        },
      ];
    }

    if (mobileFilterMode === "maths") {
      return [
        {
          key: "topic",
          label: "Topics",
          value: selectedTopic,
          onChange: (value) => applyFilterAction({ type: "SET_TOPIC", value }),
          options: topicOptions,
        },
        {
          key: "type",
          label: "Type",
          value: selectedType,
          onChange: (value) => applyFilterAction({ type: "SET_TYPE", value }),
          options: [{ value: "all", label: "All" }, ...TYPE_OPTIONS],
        },
      ];
    }

    if (mobileFilterMode === "exams") {
      return [
        {
          key: "class",
          label: "Class",
          value: selectedClass,
          onChange: (value) => applyFilterAction({ type: "SET_CLASS", value }),
          options: CLASS_OPTIONS,
        },
        {
          key: "subject",
          label: "Subject",
          value: selectedSubject,
          onChange: (value) => applyFilterAction({ type: "SET_SUBJECT", value }),
          options: dynamicSubjectOptions,
        },
        {
          key: "type",
          label: "Type",
          value: selectedType,
          onChange: (value) => applyFilterAction({ type: "SET_TYPE", value }),
          options: [{ value: "all", label: "All" }, ...TYPE_OPTIONS],
        },
      ];
    }

    return [
      {
        key: "class",
        label: "Class",
        value: selectedClass,
        onChange: (value) => applyFilterAction({ type: "SET_CLASS", value }),
        options: CLASS_OPTIONS,
      },
      {
        key: "subject",
        label: "Subject",
        value: selectedSubject,
        onChange: (value) => applyFilterAction({ type: "SET_SUBJECT", value }),
        options: dynamicSubjectOptions,
      },
      {
        key: "type",
        label: "Type",
        value: selectedType,
        onChange: (value) => applyFilterAction({ type: "SET_TYPE", value }),
        options: [{ value: "all", label: "All" }, ...TYPE_OPTIONS],
      },
    ];
  }, [
    applyFilterAction,
    dynamicSubjectOptions,
    mobileFilterMode,
    selectedClass,
    selectedSubject,
    selectedTopic,
    selectedType,
    topicOptions,
  ]);

  const toggleDesktopSection = (section) => {
    setDesktopOpen((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const renderDesktopGroup = (sectionKey, title, content) => (
    <section className="worksheets-sidebar__group">
      <button
        type="button"
        className="worksheets-sidebar__group-toggle"
        onClick={() => toggleDesktopSection(sectionKey)}
      >
        <span>{title}</span>
        <span aria-hidden="true">{desktopOpen[sectionKey] ? "−" : "+"}</span>
      </button>
      {desktopOpen[sectionKey] && (
        <div className="worksheets-sidebar__group-content">{content}</div>
      )}
    </section>
  );

  return (
    <main className="worksheets-page">
      <section className="worksheets-wrap container worksheets-wrap--wide">
        <div className="worksheets-top-row">
          <div className="worksheets-heading">
            <h1 className="worksheets-title">The Library</h1>
          </div>
        </div>

        <div className="worksheets-layout">
          <aside className="worksheets-sidebar">
            <div className="worksheets-sidebar__header">
              <h2>Filters</h2>
            </div>

            {renderDesktopGroup(
              "class",
              "Class",
              <div className="worksheets-sidebar__options">
                {CLASS_OPTIONS.map((option) => (
                  <button
                    key={`desktop-class-${option.value}`}
                    type="button"
                    className={selectedClass === option.value ? "active" : ""}
                    onClick={() => applyFilterAction({ type: "SET_CLASS", value: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {renderDesktopGroup(
              "subject",
              "Subject",
              <div className="worksheets-sidebar__options">
                {dynamicSubjectOptions.map((option) => (
                  <button
                    key={`desktop-subject-${option.value}`}
                    type="button"
                    className={selectedSubject === option.value ? "active" : ""}
                    onClick={() => applyFilterAction({ type: "SET_SUBJECT", value: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {selectedSubject !== "all" &&
              renderDesktopGroup(
                "topic",
                "Topic",
                <div className="worksheets-sidebar__options">
                  {topicOptions.map((option) => (
                    <button
                      key={`desktop-topic-${option.value}`}
                      type="button"
                      className={selectedTopic === option.value ? "active" : ""}
                      onClick={() => applyFilterAction({ type: "SET_TOPIC", value: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

            {isGrammarTopic &&
              renderDesktopGroup(
                "subtopic",
                "SubTopic",
                <div className="worksheets-sidebar__options">
                  <button
                    type="button"
                    className={selectedSubtopic === "all" ? "active" : ""}
                    onClick={() =>
                      applyFilterAction({ type: "SET_SUBTOPIC", value: "all" })
                    }
                  >
                    All
                  </button>
                  {GRAMMAR_SUBTOPIC_OPTIONS.map((option) => (
                    <button
                      key={`desktop-subtopic-${option.value}`}
                      type="button"
                      className={selectedSubtopic === option.value ? "active" : ""}
                      onClick={() =>
                        applyFilterAction({ type: "SET_SUBTOPIC", value: option.value })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

            {renderDesktopGroup(
              "type",
              "Type",
              <div className="worksheets-sidebar__options">
                <button
                  type="button"
                  className={selectedType === "all" ? "active" : ""}
                  onClick={() => applyFilterAction({ type: "SET_TYPE", value: "all" })}
                >
                  All
                </button>
                {TYPE_OPTIONS.map((option) => (
                  <button
                    key={`desktop-type-${option.value}`}
                    type="button"
                    className={selectedType === option.value ? "active" : ""}
                    onClick={() => applyFilterAction({ type: "SET_TYPE", value: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </aside>

          <div className="worksheets-content">
            <div className="worksheets-toolbar">
              <div>
                {selectedPathLabel && <p className="worksheets-path">{selectedPathLabel}</p>}
                <p>
                  {productsLoaded
                    ? `Showing ${visibleRangeStart}-${visibleRangeEnd} of ${visibleCount} results`
                    : "Loading results..."}
                </p>
              </div>
              <div className="worksheets-toolbar__actions">
                <label className="worksheets-sort">
                  <select
                    className="worksheets-sort__native"
                    value={sortBy}
                    onChange={(event) =>
                      applyFilterAction({ type: "SET_SORT", value: event.target.value })
                    }
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <DropdownSelect
                    className="worksheets-sort__mobile"
                    value={sortBy}
                    options={SORT_OPTIONS}
                    onChange={(value) => applyFilterAction({ type: "SET_SORT", value })}
                    ariaLabel="Sort options"
                  />
                </label>
              </div>
            </div>

            <div className="worksheets-clear-row">
              <button
                type="button"
                className="btn-link worksheets-clear-btn"
                onClick={() => applyFilterAction({ type: "CLEAR_FILTERS" })}
              >
                Clear filters
              </button>
            </div>

            <div className="worksheets-desktop-pane">
              <button
                type="button"
                className={activeTab === "classes" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_CLASSES" })}
              >
                Classes
              </button>
              <button
                type="button"
                className={activeTab === "english" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_ENGLISH" })}
              >
                English
              </button>
              <button
                type="button"
                className={activeTab === "maths" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_MATHS" })}
              >
                Maths
              </button>
              <button
                type="button"
                className={activeTab === "exams" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_EXAMS" })}
              >
                Exams
              </button>
            </div>

            <div className="worksheets-mobile-pane">
              <button
                type="button"
                className={mobileFilterMode === "classes" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_CLASSES" })}
              >
                Classes
              </button>
              <button
                type="button"
                className={mobileFilterMode === "english" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_ENGLISH" })}
              >
                English
              </button>
              <button
                type="button"
                className={mobileFilterMode === "maths" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_MATHS" })}
              >
                Maths
              </button>
              <button
                type="button"
                className={mobileFilterMode === "exams" ? "active" : ""}
                onClick={() => applyFilterAction({ type: "TAB_EXAMS" })}
              >
                Exams
              </button>
            </div>

            <div
              className={`worksheets-mobile-quick-filters worksheets-mobile-quick-filters--count-${mobileFilters.length}`}
            >
              {mobileFilters.map((filterItem) => (
                <label key={`mq-filter-${filterItem.key}`}>
                  <span>{filterItem.label}</span>
                  <DropdownSelect
                    value={filterItem.value}
                    options={filterItem.options}
                    onChange={filterItem.onChange}
                    ariaLabel={filterItem.label}
                  />
                </label>
              ))}
            </div>

            {visibleProducts.length === 0 && (
              <div className="worksheets-empty">
                No assets found for selected filters. Try another selection.
              </div>
            )}

            <div className="worksheets-grid">
              {visibleProducts.map((product) => {
                const quantity = getItemQuantity(product.id);
                const singlePagePreviewUrl = getPreviewUrl(product.storageKey, 1);
                const thumbnailUrl = getThumbnailUrl(product.storageKey, product.imageUrl);
                const ageLabel = !product.hideAgeLabel && product.ageLabel ? product.ageLabel : "";
                const ratingStats = normalizeRatingStats(product);
                return (
                  <article className="worksheet-card" key={product.id}>
                    <div className="worksheet-card__media worksheet-card__media--pdf">
                      <Link
                        href={`/product/${product.id}`}
                        className="worksheet-card__media-click"
                        aria-label={`Open ${product.title}`}
                      >
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={`${product.title} thumbnail`}
                            loading="lazy"
                          />
                        ) : isAndroidDevice ? (
                          <div className="worksheet-card__thumb-android">
                            <span>PDF Preview</span>
                          </div>
                        ) : (
                          <iframe
                            src={`${singlePagePreviewUrl}#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0`}
                            title={`${product.title} page 1 thumbnail`}
                            loading="lazy"
                          />
                        )}
                      </Link>
                      <button
                        type="button"
                        className="worksheet-card__preview-btn"
                        aria-label={`Quick preview ${product.title}`}
                        onClick={() => openQuickPreview(product)}
                      >
                        <EyeIcon />
                      </button>
                      <div className="worksheet-card__share worksheet-card__share--overlay">
                        <button
                          type="button"
                          className="worksheet-card__share-btn"
                          aria-label={`Share ${product.title}`}
                          onClick={(event) => openShareMenu(event, product)}
                        >
                          <ShareIcon />
                        </button>
                        {shareMenuProductId === product.id && (
                          <div className="worksheet-card__share-menu" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={(event) => shareToInstagram(event, product)}>
                              <span className="share-option__icon share-option__icon--instagram">
                                <InstagramIcon />
                              </span>
                              Instagram
                            </button>
                            <button type="button" onClick={(event) => shareToFacebook(event, product)}>
                              <span className="share-option__icon share-option__icon--facebook">
                                <FacebookIcon />
                              </span>
                              Facebook
                            </button>
                            <button type="button" onClick={(event) => shareToWhatsApp(event, product)}>
                              <span className="share-option__icon share-option__icon--whatsapp">
                                <WhatsAppIcon />
                              </span>
                              WhatsApp
                            </button>
                            <button type="button" onClick={(event) => shareCopyLink(event, product)}>
                              <span className="share-option__icon share-option__icon--copy">
                                <CopyLinkIcon />
                              </span>
                              Copy Link
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {shareStatus?.productId === product.id && shareStatus?.message && (
                      <p className="worksheet-card__share-status">{shareStatus.message}</p>
                    )}
                    <h3 className="worksheet-card__title">
                      <Link href={`/product/${product.id}`}>{product.title}</Link>
                    </h3>
                    <p className="worksheet-card__meta" aria-label={ratingStats.ratingCount > 0 ? `${product.pages || 0} fun pages, Age ${ageLabel || ""}, Rating ${formatRatingAverage(ratingStats)} out of 5, ${ratingStats.ratingCount} review${ratingStats.ratingCount === 1 ? "" : "s"}` : undefined}>
                      <span>{product.pages || 0} fun pages</span>
                      {ageLabel ? (
                        <>
                          <span className="worksheet-card__meta-sep" aria-hidden="true">
                            •
                          </span>
                          <span>{ageLabel}</span>
                        </>
                      ) : null}
                      {ratingStats.ratingCount > 0 && (
                        <>
                          <span className="worksheet-card__meta-sep" aria-hidden="true">
                            •
                          </span>
                          <span className="worksheet-card__rating-inline">
                            <span className="worksheet-card__rating-stars">
                              {buildRatingStars(ratingStats.averageRating)}
                            </span>
                            <span className="worksheet-card__rating-count">({ratingStats.ratingCount})</span>
                          </span>
                        </>
                      )}
                    </p>
                    <div className="worksheet-card__footer">
                      <p className="worksheet-card__price">
                        {formatMoney(getPriceAmount(product), getPriceCurrency(product))}
                      </p>
                      <div className="worksheet-card__actions">
                        {quantity === 0 ? (
                          <button
                            type="button"
                            className="cart-stepper cart-stepper--empty"
                            onClick={() => updateCartItem(product, 1)}
                          >
                            <span className="cart-stepper__label">Add to Cart</span>
                            <span className="cart-stepper__plus">+</span>
                          </button>
                        ) : (
                          <div className="cart-stepper">
                            <button
                              type="button"
                              className="cart-stepper__btn"
                              aria-label={`Decrease quantity for ${product.title}`}
                              onClick={() => updateCartItem(product, -1)}
                            >
                              {quantity === 1 ? (
                                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                  <path
                                    d="M6 7h12M9 7V5h6v2m-7 3v8m4-8v8m4-8v8M8 7l1 12h6l1-12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              ) : (
                                "-"
                              )}
                            </button>
                            <span className="cart-stepper__count">{quantity}</span>
                            <button
                              type="button"
                              className="cart-stepper__btn"
                              aria-label={`Increase quantity for ${product.title}`}
                              onClick={() => updateCartItem(product, 1)}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {previewState && (
        <div className="worksheet-preview-modal">
          <button
            className="worksheet-preview-modal__overlay"
            onClick={() => setPreviewState(null)}
            type="button"
            aria-label="Close preview"
          />
          <section className="worksheet-preview-modal__panel">
            <header className="worksheet-preview-modal__header">
              <h2>{previewState.title} - Quick Preview</h2>
              <button
                type="button"
                className="btn-link"
                onClick={() => setPreviewState(null)}
              >
                Close
              </button>
            </header>
            <p className="worksheet-preview-modal__hint">
              Preview shows cover image
              {previewState?.showPreviewPage ? " and first-page of the pdf." : "."}
            </p>
            {previewState?.imageUrl ? (
              <div className="worksheet-preview-modal__pages">
                <img
                  className="worksheet-preview-modal__page-image"
                  src={previewState.imageUrl}
                  alt={`${previewState.title} cover`}
                />
                {Boolean(previewState.showPreviewPage && previewState.previewImageUrl) && (
                  <img
                    className="worksheet-preview-modal__page-image"
                    src={previewState.previewImageUrl}
                    alt={`${previewState.title} first page`}
                  />
                )}
              </div>
            ) : !previewLoadFailed ? (
              <iframe
                className="worksheet-preview-modal__frame"
                src={`${getPreviewUrl(previewState.storageKey, 1)}#page=1&view=FitH,110&toolbar=0&navpanes=0&scrollbar=0`}
                title={`${previewState.title} preview`}
                onError={() => setPreviewLoadFailed(true)}
              />
            ) : (
              <div className="worksheet-preview-modal__fallback">
                <p>Preview could not load on this device/browser.</p>
                <a
                  href={getPreviewUrl(previewState.storageKey, 1)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open preview in new tab
                </a>
              </div>
            )}
          </section>
        </div>
      )}

      {isCartOpen && (
        <div className="worksheet-cart">
          <button
            className="worksheet-cart__overlay"
            onClick={() => setIsCartOpen(false)}
            type="button"
            aria-label="Close cart"
          />
          <aside className="worksheet-cart__panel">
            <div className="worksheet-cart__header">
              <h2>My Cart</h2>
              <div className="worksheet-cart__header-actions">
                {cart.length > 0 && (
                  <button
                    type="button"
                    className="btn-link worksheet-cart__clear-btn"
                    onClick={clearCart}
                  >
                    Clear cart
                  </button>
                )}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setIsCartOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="worksheet-cart__items">
              {cart.length === 0 && <p className="worksheet-cart__empty">Your cart is empty.</p>}
              {cart.map((item) => (
                <div className="worksheet-cart__item" key={item.id}>
                  <div className="worksheet-cart__thumb-wrap">
                    <span className={getSubjectBadgeClass(item.subject)}>
                      {getSubjectLabel(item.subject)}
                    </span>
                  </div>
                  <div>
                    <p className="worksheet-cart__item-title">{item.title}</p>
                    <p className="worksheet-cart__item-price">
                      {formatMoney(item.price, item.currency || "INR")}
                    </p>
                  </div>
                  <div className="worksheet-cart__qty">
                    <button
                      type="button"
                      onClick={() => updateCartItem(item, -1)}
                      aria-label={`Decrease quantity for ${item.title}`}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartItem(item, 1)}
                      aria-label={`Increase quantity for ${item.title}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="worksheet-cart__footer">
              <p>
                Total <strong>{formatMoney(cartTotal, cartCurrency)}</strong>
              </p>
              <Link href="/checkout" className="btn btn-primary">
                Proceed to Checkout
              </Link>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
