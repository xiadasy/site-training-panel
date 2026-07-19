  // browser-side loader: fetch content from minis and set into CodeMirror
  const resp = await fetch('minis://workspace/site-training-panel/index.html');
  const text = await resp.text();
  return {len: text.length, head: text.slice(0,80)};
