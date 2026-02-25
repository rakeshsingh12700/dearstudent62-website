import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore, updateDoc, doc } from "firebase/firestore";

const TITLES_PATTERN = /(action words|articles|tense)/i;

function readFirebaseConfigFromEnv() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function hasConfig(config) {
  return Boolean(
    String(config.apiKey || "").trim()
      && String(config.authDomain || "").trim()
      && String(config.projectId || "").trim()
      && String(config.appId || "").trim()
  );
}

async function main() {
  const config = readFirebaseConfigFromEnv();
  if (!hasConfig(config)) {
    console.error("Missing Firebase env vars. Source .env.local before running this script.");
    process.exit(1);
  }

  const app = initializeApp(config);
  const db = getFirestore(app);

  const snapshot = await getDocs(collection(db, "products"));
  const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

  const targets = products.filter((product) => {
    const typeValue = String(product?.type || "").toLowerCase();
    const subjectValue = String(product?.subject || "").toLowerCase();
    const classValue = String(product?.class || "").toLowerCase();
    const titleValue = String(product?.title || "");
    const isCrossClassWorksheet =
      typeValue === "worksheet" && (subjectValue === "english" || subjectValue === "maths");
    const isNamedTarget = TITLES_PATTERN.test(titleValue);
    return isCrossClassWorksheet && classValue && classValue !== "all" && isNamedTarget;
  });

  if (targets.length === 0) {
    console.log("No matching products needed migration.");
    return;
  }

  console.log("Updating class to empty for products:");
  targets.forEach((item) => {
    console.log(`- ${item.id} | ${item.title} | class=${item.class}`);
  });

  await Promise.all(
    targets.map(async (item) => {
      await updateDoc(doc(db, "products", item.id), {
        class: "",
        updatedAt: new Date().toISOString(),
      });
    })
  );

  console.log(`Updated ${targets.length} product(s).`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
