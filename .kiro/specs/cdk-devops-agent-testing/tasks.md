# Implementation Plan: CDK DevOps Agent Testing

## Overview

AWS DevOps Agentの障害調査能力を検証するためのCDKテストプロジェクトを構築する。TypeScript + AWS CDK v2で、CloudFront・S3・EC2のシンプルな構成に13個の意図的障害パターンを仕込み、CDK Assertions・Snapshotテスト・GitHub Actions CI/CDパイプラインを整備する。

## Tasks

- [x] 1. プロジェクト基盤のセットアップ
  - [x] 1.1 CDKプロジェクトの初期構成ファイルを作成する
    - `package.json`を作成し、`aws-cdk-lib` (^2.150.0)、`constructs` (^10.0.0)をdependenciesに、`typescript` (^5.4.0)、`ts-node` (^10.9.0)、`jest` (^29.0.0)、`ts-jest` (^29.0.0)、`aws-cdk` (^2.150.0)、`@types/jest`をdevDependenciesに定義する
    - `tsconfig.json`を作成し、`strict: true`を設定する
    - `cdk.json`を作成し、`app`フィールドに`npx ts-node --prefer-ts-exts bin/app.ts`を設定、contextに`@aws-cdk/core:enableStackTrace: true`と`@aws-cdk/core:pathMetadata: true`を含める
    - `jest.config.js`を作成し、`ts-jest`プリセットを設定する
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 6.5_

  - [x] 1.2 CDKアプリケーションエントリポイントを作成する
    - `bin/app.ts`を作成し、`DevopsAgentTestingStack`をインスタンス化する
    - `env`プロパティに`CDK_DEFAULT_ACCOUNT`と`CDK_DEFAULT_REGION`環境変数を使用する
    - _Requirements: 1.4, 1.8_

- [x] 2. メインStack実装（障害パターン含む）
  - [x] 2.1 S3バケットと障害パターン（FP-S3-001〜005）を実装する
    - `lib/devops-agent-testing-stack.ts`にStackクラスの骨格を作成する
    - S3バケットを`FaultBucketNoOac` Construct IDで定義し、`websiteIndexDocument: 'index.html'`と`blockPublicAccess: BlockPublicAccess.BLOCK_ALL`を設定する
    - `removalPolicy`と`autoDeleteObjects`を意図的に省略する（FP-S3-003, FP-S3-004）
    - バケットポリシーにハードコードアカウントID `123456789012` を使用する（FP-S3-005）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 CloudFrontディストリビューションと障害パターン（FP-CF-001〜003）を実装する
    - `FaultDistributionNoRootObject` Construct IDでDistributionを作成する
    - `HttpOrigin`でS3バケットのウェブサイトエンドポイントを指定する（FP-CF-001/S3アクセス不可）
    - `defaultRootObject`を省略する（FP-CF-001）
    - 403/404エラーに対し200 + `/index.html`を返すerrorResponsesを設定する（FP-CF-002）
    - `ViewerProtocolPolicy.ALLOW_ALL`を設定する（FP-CF-003）
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.3 VPC・SecurityGroup・EC2インスタンスと障害パターン（FP-EC2-001〜005）を実装する
    - VPCを`maxAzs: 2`で作成する
    - SecurityGroupを`FaultSgOpenSsh` Construct IDで作成し、`allowAllOutbound: true`（FP-EC2-002）、SSH 0.0.0.0/0インバウンド許可（FP-EC2-001）を設定する
    - EC2インスタンスを`FaultEc2HardcodedAmi` Construct IDで作成し、ハードコードAMI `ami-0abcdef1234567890`（FP-EC2-003）、パブリックサブネット配置（FP-EC2-004）を設定する
    - IAMロールを省略し、UserDataに`aws s3 ls`を設定する（FP-EC2-005）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 3. チェックポイント - TypeScriptコンパイルとCDK合成確認
  - `npx tsc --noEmit`がエラー0で完了すること、`npx cdk synth`がCloudFormationテンプレートを正常生成することを確認する。問題があればユーザーに質問する。

- [x] 4. テストの実装
  - [x] 4.1 Snapshotテストを作成する
    - `test/devops-agent-testing-stack.test.ts`にスナップショットテストを実装する
    - `Template.fromStack(stack)`でテンプレートを生成し、`toMatchSnapshot()`で検証する
    - _Requirements: 1.6, 1.7_

  - [x] 4.2 S3障害パターンのAssertionテスト（FP-S3-001〜005）を作成する
    - BlockPublicAccess.BLOCK_ALLの検証
    - OAI/OACリソースが存在しないことの検証
    - DeletionPolicyがDeleteでないことの検証（FP-S3-003）
    - バケットポリシーにハードコードアカウントID含有の検証（FP-S3-005）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 4.3 CloudFront障害パターンのAssertionテスト（FP-CF-001〜003）を作成する
    - DefaultRootObjectが未定義であることの検証（FP-CF-001）
    - CustomErrorResponsesの設定検証（FP-CF-002）
    - ViewerProtocolPolicyが`allow-all`であることの検証（FP-CF-003）
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 4.4 EC2障害パターンのAssertionテスト（FP-EC2-001〜005）を作成する
    - SecurityGroupのSSH 0.0.0.0/0インバウンド検証（FP-EC2-001）
    - ハードコードAMI IDの検証（FP-EC2-003）
    - IAM Instance Profileが未設定であることの検証（FP-EC2-005）
    - _Requirements: 4.2, 4.5, 4.7_

- [x] 5. チェックポイント - 全テスト実行確認
  - `npm test`が全テスト（スナップショット1 + アサーション13）をパスすることを確認する。問題があればユーザーに質問する。

- [x] 6. CI/CDパイプラインの実装
  - [x] 6.1 GitHub Actions workflowファイルを作成する
    - `.github/workflows/deploy.yml`を作成する
    - `push`トリガーを`main`ブランチに設定する
    - `ubuntu-latest`ランナー、Node.js 20を使用する
    - `aws-actions/configure-aws-credentials@v4`でGitHub OIDC認証を設定する
    - ステップ順: checkout → Node.js setup → npm ci → npm test → cdk synth → cdk diff → cdk deploy --require-approval never
    - `cdk synth`失敗時に後続ステップが実行されないようにする
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 7. ドキュメンテーション
  - [-] 7.1 障害パターンドキュメント（docs/fault-patterns.md）を作成する
    - 全13個の障害パターンを日本語で記述する
    - 各パターンに名前、影響リソース、症状、根本原因、推奨修正を含める
    - 重大度レベル（Critical/High/Medium/Low）で分類する
    - ソースコードファイルパスとConstruct IDのマッピングテーブルを含める
    - 各パターンに難易度（初級/中級/上級）と学習目標を含める
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [-] 7.2 README.mdを作成する
    - プロジェクト概要、セットアップ手順を記述する
    - 全障害パターン一覧テーブル（パターン名、障害カテゴリ、期待される症状、DevOps Agent診断サマリ）を含める
    - CloudFormation論理IDとCDK Construct変数名の対応を記述する
    - _Requirements: 6.3, 6.4, 6.6_

- [~] 8. 最終チェックポイント - 全体整合性確認
  - `npx tsc --noEmit`、`npm test`、`npx cdk synth`が全て成功することを確認する。問題があればユーザーに質問する。

## Notes

- 本プロジェクトはIaCプロジェクトのため、Property-Based Testingは適用しない
- テストはCDK Assertions（個別障害パターン検証）とSnapshot Test（テンプレート全体整合性）を使用
- 全ての障害パターンは`cdk synth`を通過する設計（デプロイ時またはランタイムで発現）
- チェックポイントでTypeScriptコンパイル・CDK合成・テスト実行を確認し、段階的に品質を担保する
- 各タスクは設計書の実装概要に基づき、incremental progressで進行する

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["7.1", "7.2"] }
  ]
}
```
