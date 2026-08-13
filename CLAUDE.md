# study-app

問題集・学習コンテンツを扱う学習用アプリ(進捗管理トラッカーでは`STU-*`タスクとして追跡)。

このファイルはセッション開始時に自動で読み込まれる。このリポジトリは、複数リポジトリ横断で進捗・実装ナレッジを一元管理している `gurii-gabreh/progress-tracker-dashboard` の管理対象の1つ。作業を始める前に、必ず次を読むこと(内容はここへ複製せず参照のみ。頻繁に更新されるため、複製すると鮮度がズレる)。

- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/README.md — 目標アーキテクチャ・ルームマッピング・運用ルール
- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/data/policy.json — POL-001〜(第二意見チェック起票基準、ポリシー読み込みの監査ログ、実装時の概念注釈、detail欄の空欄放置防止など)
- https://raw.githubusercontent.com/gurii-gabreh/progress-tracker-dashboard/main/data/ai-config.json — オーケストレーション方針(役割分担)

## 役割分担・記録ルール(2026-08-13、ユーザー指摘により全リポジトリへ展開)

- **manager-room(マネージャールーム)**: 全リポジトリ横断の状況把握・優先度判断・振り分けを担う。実装は行わない
- **worker-room(作業ルーム)**: このリポジトリを含む個別リポジトリ/タスクの実装を担当する。このセッションが実装作業をしている場合、それはworker-room役

実装作業を行う際は、`progress-tracker-dashboard`の`data/tasks.json`側の該当タスク(STU-*)の`detail`(実装ナレッジ)・`note`・`checkHistory`を空欄のまま完了させない(POL-005)。意味のある実装判断(設計パターン・DB設計・セキュリティ対応・AI/LLM関連・テスト方針など)があれば`data/concept-log.json`にも記録する(POL-004)。
