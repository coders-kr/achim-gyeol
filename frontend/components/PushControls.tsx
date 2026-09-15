"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { BellOff, BellRing, Check, CheckCircle2, Compass, Copy, Send } from "lucide-react";
import { deviceHeaders } from "@/lib/device";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const serverSubscriptionKey = "achim-gyeol-server-subscription";
let reconciliationInFlight: Promise<boolean> | null = null;

type Props = { deliveryTime: string; onNotice: (message: string) => void; onSubscriptionChange?: (subscribed: boolean) => void; onBeforeSubscribe?: () => Promise<void> };
type PushConfig = { enabled: boolean; publicKey: string };
type PushResponse = { delivered: boolean; message: string };
type PushSubscriptionStatus = { registered: boolean; active: boolean; needsRenewal: boolean };

export function PushControls({ deliveryTime, onNotice, onSubscriptionChange, onBeforeSubscribe }: Props) {
  const [supported, setSupported] = useState(true);
  const [iosInstallRequired, setIosInstallRequired] = useState(false);
  const [iosSafariBrowser, setIosSafariBrowser] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const inAppBrowser = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV/i.test(navigator.userAgent);
    const safari = /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent) && !inAppBrowser;
    const guidePreview = new URLSearchParams(window.location.search).get("ios-guide") === "1";
    if ((ios && !standalone) || guidePreview) {
      queueMicrotask(() => { setIosInstallRequired(true); setIosSafariBrowser(safari); setSupported(false); });
      return;
    }
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!available) { queueMicrotask(() => setSupported(false)); return; }
    reconcileExistingSubscription(deliveryTime)
      .then((active) => {
        setSubscribed(active);
        onSubscriptionChange?.(active);
      })
      .catch(() => { setSubscribed(false); onSubscriptionChange?.(false); });
  }, [deliveryTime, onSubscriptionChange]);

  const subscribe = async () => {
    setWorking(true);
    setFeedback("알림 권한을 확인하고 있어요…");
    try {
      if (!supported) throw new Error("현재 환경에서는 알림을 사용할 수 없습니다.");
      if (Notification.permission === "denied") throw new Error(samsungPermissionHelp());
      if (await Notification.requestPermission() !== "granted") throw new Error("휴대폰의 알림 허용을 눌러야 등록할 수 있어요.");
      const configResponse = await fetch(`${apiBase}/api/push/public-key`, { cache: "no-store" });
      if (!configResponse.ok) throw new Error("알림 설정을 불러오지 못했습니다.");
      const config = await configResponse.json() as PushConfig;
      if (!config.enabled || !config.publicKey) throw new Error("알림 서비스가 잠시 준비 중입니다. 운영자에게 알려주세요.");

      const registration = await navigator.serviceWorker.ready;
      let current = await registration.pushManager.getSubscription();
      if (current && !subscriptionUsesKey(current, config.publicKey)) {
        await current.unsubscribe();
        window.localStorage.removeItem(serverSubscriptionKey);
        current = null;
      }
      let subscription = current ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) });
      const [hour, minute] = deliveryTime.split(":").map(Number);
      await saveSubscription(subscription, hour, minute);

      // A provider may invalidate an endpoint while the browser still returns it
      // as an apparently valid subscription. Verify once during explicit signup;
      // if stale, rotate the endpoint and register the fresh one automatically.
      if (!subscribed) {
        setFeedback("알림 연결을 확인하고 있어요…");
        let validation = await validateSubscription(subscription.endpoint);
        if (!validation.delivered) {
          await subscription.unsubscribe().catch(() => false);
          window.localStorage.removeItem(serverSubscriptionKey);
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) });
          await saveSubscription(subscription, hour, minute);
          validation = await validateSubscription(subscription.endpoint);
          if (!validation.delivered) {
            await subscription.unsubscribe().catch(() => false);
            window.localStorage.removeItem(serverSubscriptionKey);
            throw new Error(validation.message || "알림 연결을 확인하지 못했습니다. 알림 설정을 확인해 주세요.");
          }
        }
      }
      await onBeforeSubscribe?.();
      window.localStorage.setItem("achim-gyeol-delivery", JSON.stringify({ time: deliveryTime }));
      window.localStorage.setItem(serverSubscriptionKey, subscription.endpoint);
      setSubscribed(true);
      onSubscriptionChange?.(true);
      const message = `등록 완료! 확인 알림을 보냈어요. 평일 ${deliveryTime}에 오늘 필요한 뉴스를 보내드려요.`;
      setFeedback(message);
      onNotice(message);
    } catch (error) {
      setSubscribed(false);
      onSubscriptionChange?.(false);
      const message = error instanceof Error ? error.message : "알림 등록 중 오류가 발생했습니다.";
      setFeedback(message);
      onNotice(message);
    }
    finally { setWorking(false); }
  };

  const unsubscribe = async () => {
    setWorking(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch(`${apiBase}/api/push/subscriptions`, { method: "DELETE", headers: deviceHeaders(), body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error(await errorMessage(response, "알림 해지를 완료하지 못했습니다."));
        await subscription.unsubscribe();
      }
      window.localStorage.removeItem(serverSubscriptionKey);
      setSubscribed(false); onSubscriptionChange?.(false); onNotice("이 기기의 뉴스 알림을 해지했습니다.");
    } catch { onNotice("알림 해지를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setWorking(false); }
  };

  const sendTest = async () => {
    setWorking(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("먼저 이 기기에 알림을 등록해 주세요.");
      const response = await fetch(`${apiBase}/api/push/test`, { method: "POST", headers: deviceHeaders(), body: JSON.stringify({ endpoint: subscription.endpoint }) });
      if (!response.ok) throw new Error(await errorMessage(response, "테스트 알림을 발송하지 못했습니다."));
      const result = await response.json() as PushResponse;
      if (!result.delivered) throw new Error(result.message);
      onNotice("이 기기로 테스트 알림을 보냈습니다. 잠금화면·알림센터를 확인해 주세요.");
    } catch (error) { onNotice(error instanceof Error ? error.message : "테스트 발송 중 오류가 발생했습니다."); }
    finally { setWorking(false); }
  };

  if (iosInstallRequired) return <div className="push-controls ios-push-controls"><IosInstallGuide safari={iosSafariBrowser} /></div>;
  if (!supported) return <div className="push-controls unsupported-push-controls">
    <button className="primary-button" onClick={() => onNotice("Safari 또는 최신 Chrome·Edge에서 열어 주세요. 아이폰은 Safari의 ‘홈 화면에 추가’ 후 등록할 수 있습니다.")}><BellRing size={16} /> 이 기기에 알림 등록</button>
    <p className="push-help">현재 환경에서는 알림을 받을 수 없습니다. Safari 또는 최신 Chrome·Edge에서 다시 열어 주세요.</p>
  </div>;
  return <div className="push-controls">
    <button type="button" className="primary-button" onClick={subscribe} disabled={working}><BellRing size={16} /> {working ? "등록 확인 중…" : subscribed ? "알림 등록 확인" : "이 기기에 알림 등록"}</button>
    {feedback && <p className="push-feedback" role="status">{feedback}</p>}
    {subscribed && <p className="push-status"><CheckCircle2 size={15} /> 이 기기의 아침 뉴스 알림 등록이 완료됐습니다.</p>}
    {subscribed && <button className="secondary-button blue" onClick={sendTest} disabled={working}><Send size={16} /> 내 기기 알림 테스트</button>}
    {subscribed && <button className="text-button" onClick={unsubscribe} disabled={working}><BellOff size={15} /> 알림 해지</button>}
    <p className="push-help">회원가입 없이 바로 등록됩니다. 처음 한 번 알림만 허용하면 되고, 테스트 알림은 이 기기에만 전송됩니다.</p>
  </div>;
}

async function saveSubscription(subscription: PushSubscription, hour: number, minute: number) {
  const response = await fetch(`${apiBase}/api/push/subscriptions`, {
    method: "POST",
    headers: deviceHeaders(),
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
      deliveryHour: hour,
      deliveryMinute: minute,
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, "알림 설정을 저장하지 못했습니다."));
}

async function validateSubscription(endpoint: string) {
  const response = await fetch(`${apiBase}/api/push/test`, {
    method: "POST",
    headers: deviceHeaders(),
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, "기기 알림 연결을 확인하지 못했습니다."));
  return response.json() as Promise<PushResponse>;
}

function samsungPermissionHelp() {
  if (/SamsungBrowser/i.test(navigator.userAgent)) {
    return "Samsung Internet에서 알림이 차단되어 있어요. 메뉴(≡) → 설정 → 사이트 및 다운로드 → 알림에서 morningnews.coders.kr을 허용해 주세요.";
  }
  return "브라우저 설정에서 morningnews.coders.kr 알림을 허용한 뒤 다시 눌러 주세요.";
}

function IosInstallGuide({ safari }: { safari: boolean }) {
  const [copied, setCopied] = useState(false);

  const copySafariUrl = async () => {
    const target = new URL(window.location.href);
    target.searchParams.set("ios-guide", "1");
    target.hash = "delivery-deck";
    try {
      await navigator.clipboard.writeText(target.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("아래 주소를 복사해 Safari 주소창에 붙여넣으세요.", target.toString());
    }
  };

  return <section className="ios-install-guide" aria-labelledby="ios-guide-title">
    <div className="ios-guide-heading">
      <span className="ios-guide-badge">{safari ? "Safari · 처음 한 번만" : "iPhone · Safari 필요"}</span>
      <h3 id="ios-guide-title">{safari ? "Safari에서 홈 화면에 추가하세요" : "Safari에서 이어서 설정하세요"}</h3>
      <p>{safari ? "지금 열린 Safari에서 아래 순서대로 하면 됩니다." : "카카오톡·네이버 앱 안에서는 알림을 등록할 수 없어 Safari로 한 번 옮겨야 합니다."}</p>
    </div>
    {!safari && <div className="ios-safari-handoff">
      <Compass size={22} />
      <div><strong>먼저 Safari로 옮기기</strong><span>주소를 복사한 뒤 Safari 주소창에 붙여넣으세요.</span></div>
      <button type="button" onClick={() => void copySafariUrl()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "복사됨" : "주소 복사"}</button>
    </div>}
    <Image
      className="ios-guide-image"
      src="/iphone-pwa-guide.png"
      width={864}
      height={1792}
      sizes="(max-width: 600px) calc(100vw - 66px), 470px"
      alt="아이폰 Safari에서 오른쪽 아래 점 세 개, 더 보기, 홈 화면에 추가, 오른쪽 위 추가를 차례로 누르는 방법"
      priority
    />
    <ol className="ios-guide-text-steps">
      {!safari && <li><b>Safari</b> 앱을 열고 복사한 주소를 붙여넣어요.</li>}
      <li><b>…</b> 버튼을 누르고 <b>더 보기</b>를 선택해요.</li>
      <li>아래로 내려 <b>홈 화면에 추가</b>를 눌러요.</li>
      <li><b>추가</b> 후 홈 화면의 아침결에서 알림을 허용해요.</li>
    </ol>
    <p className="ios-guide-finish"><CheckCircle2 size={16} /> 실제 화면의 초록색 표시만 순서대로 따라 하세요.</p>
  </section>;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function subscriptionUsesKey(subscription: PushSubscription, publicKey: string) {
  const applicationServerKey = subscription.options.applicationServerKey;
  if (!applicationServerKey) return false;
  const current = new Uint8Array(applicationServerKey);
  const expected = urlBase64ToUint8Array(publicKey);
  return current.length === expected.length && current.every((value, index) => value === expected[index]);
}

export function reconcileExistingSubscription(deliveryTime: string) {
  if (reconciliationInFlight) return reconciliationInFlight;
  reconciliationInFlight = reconcileSubscription(deliveryTime)
    .finally(() => { reconciliationInFlight = null; });
  return reconciliationInFlight;
}

async function reconcileSubscription(deliveryTime: string) {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const savedEndpoint = window.localStorage.getItem(serverSubscriptionKey);
  if (!subscription || Notification.permission !== "granted") return false;

  const configResponse = await fetch(`${apiBase}/api/push/public-key`, { cache: "no-store" });
  if (!configResponse.ok) return Boolean(savedEndpoint && savedEndpoint === subscription.endpoint);
  const config = await configResponse.json() as PushConfig;
  if (!config.enabled || !config.publicKey) return Boolean(savedEndpoint && savedEndpoint === subscription.endpoint);
  let needsServerSync = savedEndpoint !== subscription.endpoint;

  const serverStatus = await fetch(`${apiBase}/api/push/subscriptions/status`, {
    method: "POST",
    headers: deviceHeaders(),
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).then(async (response) => response.ok ? response.json() as Promise<PushSubscriptionStatus> : null).catch(() => null);

  if (serverStatus?.needsRenewal) {
    // The push provider can expire an endpoint while the browser still exposes
    // it locally. Existing permission lets us rotate it on a normal page visit,
    // without asking the reader to press the registration button again.
    await subscription.unsubscribe().catch(() => false);
    window.localStorage.removeItem(serverSubscriptionKey);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
    needsServerSync = true;
  } else if (serverStatus && !serverStatus.registered) {
    needsServerSync = true;
  }

  if (!subscriptionUsesKey(subscription, config.publicKey)) {
    // A VAPID key rotation makes the old endpoint permanently unusable. Because
    // permission is already granted, repair it without asking the reader again.
    await subscription.unsubscribe();
    window.localStorage.removeItem(serverSubscriptionKey);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
    needsServerSync = true;
  }
  if (!needsServerSync) return true;

  const savedDelivery = readSavedDelivery();
  const effectiveTime = savedDelivery?.time ?? deliveryTime;
  const [hour, minute] = effectiveTime.split(":").map(Number);
  const response = await fetch(`${apiBase}/api/push/subscriptions`, {
    method: "POST",
    headers: deviceHeaders(),
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
      deliveryHour: hour,
      deliveryMinute: minute,
    }),
  });
  if (!response.ok) {
    await subscription.unsubscribe().catch(() => false);
    return false;
  }
  window.localStorage.setItem(serverSubscriptionKey, subscription.endpoint);
  return true;
}

function readSavedDelivery() {
  try {
    const value = JSON.parse(window.localStorage.getItem("achim-gyeol-delivery") ?? "null") as { time?: unknown } | null;
    if (!value || typeof value.time !== "string") return null;
    return { time: value.time };
  } catch {
    return null;
  }
}

async function errorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return body?.message || fallback;
}
