// イベントマスタ.json の内容を、実行した本人のFirestoreへ反映する。
//
// 使い方：
//   npm install
//   node sync-event-master.js <自分のGCPプロジェクトID>
//
// 事前に `gcloud auth application-default login` でADCを設定しておくこと
// （03_リソース構築/インストールパッケージ/手順書.md ステップ2-4参照）。
//
// 動作：
// - イベントマスタ.json に載っているイベントIDのドキュメントを、event_masterコレクションへ
//   set({merge: true})で反映する。既に同じIDのドキュメントがあれば内容を上書き更新する
//   （提供元が日程・イベント名を修正した場合に追従できる）
// - イベントマスタ.json に載っていないイベントID（自分で個別に追加したイベント等）には
//   一切触れない・削除もしない

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = process.argv[2];
if (!projectId) {
  console.error("使い方: node sync-event-master.js <自分のGCPプロジェクトID>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const __dirname = dirname(fileURLToPath(import.meta.url));
const events = JSON.parse(readFileSync(join(__dirname, "イベントマスタ.json"), "utf-8"));

function toTimestampOrNull(dateStr) {
  if (!dateStr) return null;
  return Timestamp.fromDate(new Date(dateStr));
}

async function main() {
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
