import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, updateDoc } from "firebase/firestore";

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

function parseArgs(argv) {
  const args = { id: "", title: "", classValue: "", apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (token === "--id") args.id = String(argv[i + 1] || "").trim();
    if (token === "--title") args.title = String(argv[i + 1] || "").trim();
    if (token === "--class") args.classValue = String(argv[i + 1] || "").trim();
    if (token === "--apply") args.apply = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.classValue) {
    console.error("Missing --class value (example: --class class-2)");
    process.exit(1);
  }
  if (!args.id && !args.title) {
    console.error("Provide --id or --title");
    process.exit(1);
  }

  const config = readFirebaseConfigFromEnv();
  if (!hasConfig(config)) {
    console.error("Missing Firebase env vars. Source .env.local before running this script.");
    process.exit(1);
  }

  const app = initializeApp(config);
  const db = getFirestore(app);
  const snapshot = await getDocs(collection(db, "products"));
  const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

  const titleNeedle = args.title.toLowerCase();
  const targets = products.filter((product) => {
    if (args.id) return String(product.id || "") === args.id;
    return String(product.title || "").toLowerCase().includes(titleNeedle);
  });

  if (targets.length === 0) {
    console.log("No products matched.");
    return;
  }

  console.log(`Matched ${targets.length} product(s):`);
  targets.forEach((item) => {
    console.log(`- ${item.id} | ${item.title} | class=${String(item.class || "") || "(empty)"}`);
  });

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to update.");
    return;
  }

  await Promise.all(
    targets.map(async (item) => {
      await updateDoc(doc(db, "products", item.id), {
        class: args.classValue,
        updatedAt: new Date().toISOString(),
      });
    })
  );

  console.log(`Updated ${targets.length} product(s) to class=${args.classValue}.`);
}

main().catch((error) => {
  console.error("Update failed:", error);
  process.exit(1);
});
