async function run() {
  try {
    const url = "https://koxtzeymsujzlqrpsims.supabase.co/functions/v1/parse-pdf";
    console.log("Fetching " + url);
    const res = await fetch(url, { method: "OPTIONS" });
    console.log("Status:", res.status);
    console.log("Headers:", Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log("Body:", text);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
run();
