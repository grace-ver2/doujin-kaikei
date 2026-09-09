// GitHub上に公開されている イベントマスタ.json の内容を、実行した本人のFirestoreへ反映する。
//
// 使い方：
//   npm install
//   node sync-event-master.js <自分のGCPプロジェクトID>
//
// 事前に `gcloud auth application-default login` でADCを設定しておくこと
// （03_リソース構築/インストールパッケージ/手順書.md ステップ2-4参照）。
//
// 動作：
// - リポジトリをclone・pullしていなくても、実行するたびにGitHub上の最新の
//   イベントマスタ.json を直接取得する（`git pull`は不要）
// - 取得したイベントIDのドキュメントを、event_masterコレクションへset({merge: true})で反映する。
//   既に同じIDのドキュメントがあれば内容を上書き更新する（提供元が日程・イベント名を
//   修正した場合に追従できる）
// - イベントマスタ.json に載っていないイベントID（自分で個別に追加したイベント等）には
//   一切触れない・削除もしない
// - GitHubへ接続できない場合は、このスクリプトと同じフォルダにある イベントマスタ.json
//   （前回`git pull`した時点の内容）を代わりに使う

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// 日本語を含むパスはセグメントごとにURLエンコードすること。生の日本語文字列のままだと
// 環境（特にWindows上のシェル）によってはリクエスト自体が壊れることを実機で確認している。
const RAW_URL =
  "https://raw.githubusercontent.com/grace-ver2/doujin-kaikei/main/" +
  encodeURIComponent("マスタデータ") +
  "/" +
  encodeURIComponent("イベントマスタ.json");

const projectId = process.argv[2];
if (!projectId) {
  console.error("使い方: node sync-event-master.js <自分のGCPプロジェクトID>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

async function fetchEvents() {
  try {
    const res = await fetch(RAW_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    console.log(`GitHub上の最新のイベントマスタ.jsonを取得しました：${RAW_URL}`);
    return await res.json();
  } catch (err) {
    console.warn(`GitHubからの取得に失敗したため、ローカルのイベントマスタ.jsonを使います（理由: ${err.message}）`);
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const localPath = join(__dirname, "イベントマスタ.json");
    return JSON.parse(readFileSync(localPath, "utf-8"));
  }
}

function toTimestampOrNull(dateStr) {
  if (!dateStr) return null;
  return Timestamp.fromDate(new Date(dateStr));
}

async function main() {
  const events = await fetchEvents();

  if (events.length === 0) {
    console.log("イベントマスタ.json が空です。反映するものはありません。");
    return;
  }

  console.log(`${events.length}件のイベントを "${projectId}" のFirestoreへ同期します...`);
  let count = 0;

  for (const ev of events) {
    const docId = ev["イベントID"];
    if (!docId) {
      console.warn("イベントIDが無いレコードをスキップしました:", ev);
      continue;
    }
    await db.collection("event_master").doc(docId).set(
      {
        "イベントID": docId,
        "イベント名": ev["イベント名"],
        "開催開始日": toTimestampOrNull(ev["開催開始日"]),
        "開催終了日": toTimestampOrNull(ev["開催終了日"]),
        "ジャンル": ev["ジャンル"] ?? null,
      },
      { merge: true }
    );
    count++;
    console.log(`✓ ${docId}: ${ev["イベント名"]}`);
  }

  console.log(`完了：${count}件を反映しました。`);
}

main().catch((err) => {
  console.error("同期に失敗しました:", err);
  process.exit(1);
});
