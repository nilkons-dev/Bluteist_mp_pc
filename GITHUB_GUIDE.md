# Blutheist — GitHub-এ আপলোড ও Windows installer বানানোর গাইড

## ১. এই আপডেটে কী বদলেছে
- নতুন চোখ-লোগো (অ্যাপ আইকন, টাস্কবার, ইনস্টলার সহ) ও Blutheist ওয়ার্ডমার্ক
- নতুন ইন্ট্রো: লোগো নিজে আঁকা হয় → চোখ খোলে → ওয়ার্ডমার্ক উঠে আসে। পুরো অ্যানিমেশন শেষ হলে তবেই অ্যাপের ভেতরের পেজ
- টপবার: মাউস-ফলো করা অ্যানিমেটেড লোগো (ক্লিক করলে চোখ বন্ধ → খোলা → লাল মণি) + Blutheist ওয়ার্ডমার্ক
- প্লেয়ারের নিচে নতুন কন্ট্রোল (শাফল, প্রিভিয়াস, চোখ-প্লে বাটন, নেক্সট, রিপিট, স্পার্কল সিক বার)
- Google / Create account / Sign in বন্ধ। শুধু **Continue as guest** + ডিসপ্লে নেম। পরে চালু করতে `src/lib/config.ts`-এ `ACCOUNTS_ENABLED = true`
- আপডেটার বন্ধ (যাতে মূল ByTune-এর রিলিজে আপডেট না যায়)। নিজের রিলিজ থাকলে `electron/updater.ts`-এ `UPDATES_ENABLED` ও `RELEASES` ঠিক করুন

## ২. GitHub-এ নতুন রিপোজিটরি
1. github.com → **New repository** → নাম `Blutheist` → Create (README/gitignore যোগ করবেন না)।
2. Repository পেজে **uploading an existing file** লিঙ্কে ক্লিক করে ফাইল আপলোড করা যায়, কিন্তু ZIP এক্সট্র্যাক্ট GitHub-এ হয় না। তাই নিচের Codespace পদ্ধতি সবচেয়ে সহজ।

## ৩. Codespace দিয়ে ZIP আপলোড, এক্সট্র্যাক্ট ও পুশ
1. রিপোজিটরিতে **Code → Codespaces → Create codespace on main**।
2. বাঁদিকের Explorer-এ ফাঁকা জায়গায় ডান-ক্লিক → **Upload...** → `Blutheist.zip` সিলেক্ট করুন।
3. নিচের Terminal-এ:

```bash
unzip -q Blutheist.zip
# জিপের ভেতরের ফোল্ডারের নাম দেখুন (সাধারণত ByTune-main)
ls
# ফোল্ডারের ভেতরের সব ফাইল রুটে আনুন (ফোল্ডারের নাম অনুযায়ী বদলান)
shopt -s dotglob
mv ByTune-main/* .
rmdir ByTune-main
rm Blutheist.zip

git add -A
git commit -m "Blutheist: new logo, intro, eye controls, guest-only"
git push origin main
```

## ৪. নিজের কম্পিউটার থেকে পুশ (বিকল্প)
```bash
unzip Blutheist.zip && cd ByTune-main
git init
git add -A
git commit -m "Blutheist: new logo, intro, eye controls, guest-only"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/Blutheist.git
git push -u origin main
```

## ৫. Windows installer (.exe) বানানো
**GitHub Actions দিয়ে (সহজ):**
1. রিপোজিটরি → **Actions** → বাঁদিকে **Build Windows installer** → **Run workflow**।
2. ৫–১০ মিনিট পর রান শেষে নিচে **Artifacts → Blutheist-Windows** ডাউনলোড করুন; ভেতরে `Blutheist-Setup.exe`।
3. Release বানাতে চাইলে: `git tag v1.0.0 && git push origin v1.0.0` — installer নিজে Releases-এ উঠে যাবে।

**নিজের Windows PC-তে:**
```bash
npm ci
npm run dist:win      # ফলাফল: release/Blutheist-Setup.exe
```
(Node 22 দরকার।)

## ৬. লোকালি চালিয়ে দেখা
```bash
npm ci
npm run dev           # ডেভ মোড
npm test              # টেস্ট
```

## ৭. আইকন বদলাতে চাইলে
`src/assets/brand/blutheist-icon.svg` এডিট করে `npm run icon` চালান।

## ৮. লাইসেন্স
এই প্রজেক্ট GPL-3.0 লাইসেন্সের ByTune-এর উপর ভিত্তি করে। অ্যাপ অন্যদের দিলে LICENSE ফাইল রাখতে হবে এবং সোর্স কোড উন্মুক্ত রাখতে হবে।
