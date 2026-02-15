import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import products from "../data/products";
import { getPreviewUrl } from "../lib/productAssetUrls";

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
  { value: "default", label: "Default sorting" },
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
        view: "english",
      };
    case "TAB_MATHS":
      return {
        ...state,
        subject: "maths",
        view: "maths",
      };
    case "TAB_EXAMS":
      return {
        ...state,
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
      const tab = String(event.tab || "");
      if (tab === "english") {
        return {
          ...state,
          subject: "english",
          type: "all",
          topic: "all",
          subtopic: "all",
          view: "english",
          class: "all",
        };
      }
      if (tab === "maths") {
        return {
          ...state,
          subject: "maths",
          type: "all",
          topic: "all",
          subtopic: "all",
          view: "maths",
          class: "all",
        };
      }
      if (tab === "exams") {
        return {
          ...state,
          type: "exams",
          topic: "all",
          subtopic: "all",
          view: "exams",
          class: "all",
          subject: "all",
        };
      }
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

  const subtopics = Object.keys(SUBTOPIC_PATTERNS).filter((key) =>
    SUBTOPIC_PATTERNS[key].some((pattern) => pattern.test(sourceText))
  );

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
    if (typeof window === "undefined") return;
    const openCart = () => setIsCartOpen(true);
    window.addEventListener("ds-open-cart", openCart);
    return () => {
      window.removeEventListener("ds-open-cart", openCart);
    };
  }, []);

  const taxonomyById = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      map.set(product.id, inferTaxonomy(product));
    });
    return map;
  }, []);

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
      const typeMatch = selectedType === "all" || normalizeType(product.type) === selectedType;
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
  }, [selectedClass, selectedType, taxonomyById]);

  const topicOptions = useMemo(() => {
    if (selectedSubject === "all") return [{ value: "all", label: "All" }];

    const predefined = TOPIC_OPTIONS_BY_SUBJECT[selectedSubject] || [];
    const dynamicValues = new Set();

    products.forEach((product) => {
      const taxonomy = taxonomyById.get(product.id);
      if (!taxonomy) return;

      const classMatch = selectedClass === "all" || product.class === selectedClass;
      const typeMatch = selectedType === "all" || normalizeType(product.type) === selectedType;
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
  }, [selectedClass, selectedSubject, selectedType, taxonomyById]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const taxonomy = taxonomyById.get(product.id);
      const classMatch = selectedClass === "all" || product.class === selectedClass;
      const typeMatch = selectedType === "all" || normalizeType(product.type) === selectedType;
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
  }, [isGrammarTopic, selectedClass, selectedSubtopic, selectedSubject, selectedTopic, selectedType, sortBy, taxonomyById]);

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

  const getItemQuantity = (productId) => {
    const item = cart.find((cartItem) => cartItem.id === productId);
    return item ? item.quantity : 0;
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
                  Showing {visibleProducts.length === 0 ? 0 : 1}-{visibleProducts.length} of{" "}
                  {visibleProducts.length} results
                </p>
              </div>
              <div className="worksheets-toolbar__actions">
                <label className="worksheets-sort">
                  <span>Sort:</span>
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
                onClick={() =>
                  applyFilterAction({ type: "CLEAR_FILTERS", tab: activeTab })
                }
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

                return (
                  <article className="worksheet-card" key={product.id}>
                    <div className="worksheet-card__media worksheet-card__media--pdf">
                      <Link
                        href={`/product/${product.id}`}
                        className="worksheet-card__media-click"
                        aria-label={`Open ${product.title}`}
                      >
                        <iframe
                          src={`${singlePagePreviewUrl}#page=1&view=Fit&toolbar=0&navpanes=0&scrollbar=0`}
                          title={`${product.title} page 1 thumbnail`}
                          loading="lazy"
                        />
                      </Link>
                      <button
                        type="button"
                        className="worksheet-card__preview-btn"
                        aria-label={`Quick preview ${product.title}`}
                        onClick={() => setPreviewState(product)}
                      >
                        <EyeIcon />
                      </button>
                    </div>

                    <p className="worksheet-card__age">{product.ageLabel || "AGE 3+"}</p>
                    <h3 className="worksheet-card__title">
                      <Link href={`/product/${product.id}`}>{product.title}</Link>
                    </h3>
                    <p className="worksheet-card__meta">
                      {(product.type || "worksheet").replaceAll("-", " ")} |{" "}
                      {product.pages || 0} Pages | Digital PDF
                    </p>
                    <p className="worksheet-card__price">INR {product.price}</p>
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
            <p className="worksheet-preview-modal__hint">Preview shows page 1 only.</p>
            <iframe
              className="worksheet-preview-modal__frame"
              src={`${getPreviewUrl(previewState.storageKey, 1)}#page=1&view=FitH,110&toolbar=0&navpanes=0&scrollbar=0`}
              title={`${previewState.title} preview`}
            />
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
                  <div>
                    <p className="worksheet-cart__item-title">{item.title}</p>
                    <p className="worksheet-cart__item-price">INR {item.price}</p>
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
                Total <strong>INR {cartTotal}</strong>
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
