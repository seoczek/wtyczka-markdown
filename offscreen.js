chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message.type !== "WM_CLIPBOARD_WRITE") return false;
  const field = document.createElement("textarea");
  field.value = message.text;
  document.body.append(field);
  field.select();
  sendResponse(document.execCommand("copy"));
  field.remove();
  return false;
});
