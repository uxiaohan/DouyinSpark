// 直接以 app.fetch 打一遍 /api 路由，覆盖单元测试之外的 friends/messages/runs 分支。
// 用法：
//   bun run scripts/clean-db.ts data/smoke-api.db
//   $env:DB_PATH = 'data/smoke-api.db'; bun run scripts/smoke-api.ts
// 注意：
//   1. 必须在启动前通过环境变量传 DB_PATH，ES 模块导入先于本文件主体执行；
//   2. 库文件要先删（导入时就已打开，见 clean-db.ts），否则沿用旧口令会 401。
import { createApp } from "../src/web/index.ts"
import { DEFAULT_SETTINGS } from "../src/config.ts"

const app = createApp();

const call = async (path: string, init: RequestInit = {}) => {
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, body, headers: res.headers };
};

let failed = 0;
const check = (name: string, status: number, expected: number) => {
  if (status !== expected) {
    failed += 1;
    console.error(`FAIL ${name}: ${status} != ${expected}`);
  } else {
    console.log(`ok   ${name}: ${status}`);
  }
};

const login = await call("/api/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: "smoke-pass" }),
});
check("login", login.status, 200);
// 令牌只在 Set-Cookie 里，响应体不含
const setCookie = login.headers.get("set-cookie") ?? "";
const cookie = /(?:^|;\s*)session=([^;]+)/.exec(setCookie)?.[1] ?? "";
if (cookie.length === 0) {
  console.error("FAIL 未取到 session cookie");
  process.exit(1);
}
console.log("     set-cookie:", setCookie);
const auth = { cookie: `session=${cookie}` };

const unauth = await call("/api/friends");
check("accounts 未登录", unauth.status, 401);

// 建账号 → 建好友 → 查好友 → 删好友 → 删账号，走一遍带鉴权的写路径
const acc = await call("/api/accounts", {
  method: "POST",
  headers: { ...auth, "content-type": "application/json" },
  body: JSON.stringify({ alias: "冒烟账号" }),
});
check("accounts POST", acc.status, 200);
const accountId = (acc.body as { id: number }).id;

const friends = await call(`/api/accounts/${accountId}/friends`, { headers: auth });
check("friends GET", friends.status, 200);
console.log("     friends:", JSON.stringify(friends.body));

const addFriend = await call(`/api/accounts/${accountId}/friends`, {
  method: "POST",
  headers: { ...auth, "content-type": "application/json" },
  body: JSON.stringify({ name: "冒烟好友" }),
});
check("friends POST", addFriend.status, 200);
const friendId = (addFriend.body as { id: number }).id;
const delFriend = await call(`/api/accounts/${accountId}/friends/${friendId}`, {
  method: "DELETE",
  headers: auth,
});
check("friends DELETE", delFriend.status, 200);
const delAccount = await call(`/api/accounts/${accountId}`, { method: "DELETE", headers: auth });
check("accounts DELETE", delAccount.status, 200);

const msgs = await call("/api/messages", { headers: auth });
check("messages", msgs.status, 200);
console.log("     messages:", JSON.stringify(msgs.body));

const addMsg = await call("/api/messages", {
  method: "POST",
  headers: { ...auth, "content-type": "application/json" },
  body: JSON.stringify({ text: "路由冒烟新增话术" }),
});
check("messages POST", addMsg.status, 200);

const runs = await call("/api/runs", { headers: auth });
check("runs", runs.status, 200);
console.log("     runs:", JSON.stringify(runs.body));

const notifyTest = await call("/api/notify/test", { method: "POST", headers: auth });
console.log("     notify/test:", notifyTest.status, JSON.stringify(notifyTest.body));
if (notifyTest.status !== 200 && notifyTest.status !== 400) {
  failed += 1;
  console.error("FAIL notify/test 状态异常");
}

const settingsSave = await call("/api/settings", {
  method: "PUT",
  headers: { ...auth, "content-type": "application/json" },
  body: JSON.stringify({ ...DEFAULT_SETTINGS }),
});
check("settings PUT", settingsSave.status, 200);
const nextRun = await call("/api/next-run", { headers: auth });
check("next-run", nextRun.status, 200);
console.log("     next-run:", JSON.stringify(nextRun.body));
if (Date.parse((nextRun.body as { nextRunAt: string }).nextRunAt) <= Date.now()) {
  failed += 1;
  console.error("FAIL next-run 不是未来时间");
}

console.log(failed === 0 ? "\nAPI_ROUTES_OK" : `\nAPI_ROUTES_FAIL(${failed})`);
process.exit(failed === 0 ? 0 : 1);
