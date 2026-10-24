import { gameIcon, type GameIconId } from "../cv/gameIcons";
import type { StoredTemplate } from "../cv/match";

/** 미니맵의 룬 아이콘 (실제 게임 화면에서 잘라 둔 것) */
export const RUNE_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAUCAYAAABvVQZ0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAATrSURBVDhPbc9pUNQFAIbxf3hAqRg6ZmXXOCKohAcgmeKBnILLssByrq5cCwsLuBxKIAvLsQiCu8tyCHIjArvcQSICYzqoZVqZU1ofmsaZPuTUVNN0OM7TQHbN+OH5+pv3FUIlUYQ9KTxERrhERoRERnhwNFJxJFJxOJKDYsQH/BH7eiHes4sgl214OqzjFVtrVi4VeGmlwNo1ixCehs0XHE2YOJIwsRSJKOgfLOgJtt/RHoeX7bB/bTlO6+xweOPZp2B/gyExxMsVFOYXUVdTQ6WuFLVSQYjXPkSu29jnYM/aVct5cYUNq1dYY7dM+D8WJomeR+aKkyehLSjBfN7CWVMT7WdaOGuqQSmLQuqxi72O61nz/BKW2lhhvVBgwTPzWPR/sLl10USExlBSpGPAPMi1mevs3LAbVUwaN2au0mw0kBIayp4Njqy2XYLNIiusF1uxYIGAIBbJkAT9ix05lECptpzBnhGaqlsJdJGQJykl1TsbuX8sE70jnNVVEi8J5gXbZdhYL2Lx4oVYzWEyWTaBAVGEBEcTF5tMkaaEAfMQJt0ZjodqUWw+xlD8LI3ifhRvqdHEFdJ6qhZ9cTEe291YtcJuHpzHcrL0hIiPEBMZR5GmlJ5OCxOWaeT7lCRuzOFGztfcSfuBTzIeYo6dZq9tAMWJxZibuijKzcN1izPLbZewwEpAMFR3oT1RySmdHkvPIJa2YTxe9UXjc5pLCXe4m/oT95J/4wvlr9xO+Y53428QuyUVuXcsV8amKczLxd11KwvnsIG+S5jPjTN9YZbqShMJoSoyvAvoi52ZX/Sl4hFfKR7Pdz/pER9nPKQ2/Bwq/0ziQ+TUn64i+cghnpu7OT76PqPDN7h18wHlZXUEeUSji6hnTHmTz1Q//gUlPknxmE/Tvqc7/gJZB/Pxc/Oi2ahHezSd15cvQ2htGabKOIh56CMuX7lLb/M4DlZulPk2cEv9LZ+n/ML9pD+4l/w7d1N/5sPsb5DZKwlzi+DO5Q/oNBlJj5Di6bQRQW8aorx2nJqOaVq6x2hv66epqpPE/Rkcd6/gZuaD+YVzl0firhG5VkGeTENLdQPnG+pRH44iwuNtvDY5InR2TdJhuU6r+QoNrRYaz3YyNnKBYnUZad7H0XrVMJF0m56oaXK9y0j0S6XupIn2xnqyFHKknjs5uNkJn40OCLNTl7k6c4uJ8ev0dA9TazyDsaqGC0MT1JU34rzSnfKoOlR7c/HZHMjk0EW6WlrIUinw3bmNA9udEW3ehO8cNtLTh6GyhQpdKybDOepMHRTkFVOjN9F97jy9HRb8XESowo/S391PS3MjR9OSkQR64efhwgF3Z4K2OuG7cT1Crb6LvKIeMvP7yNf2kq9pQiZTkqRIQacrZ7B/gJJ8LTWVBrra21BnpCCVBOK3bwc+u7bi7/4moq1zy+wRDIZ2KkxjaPXvUVhpIfMdPYEiKSKRiCRlIrV1eiYvjjI63IfxtI5khYzI8AAOBu7G29OFgP2uhO51I8TDBWFyapSpa7NcnL3O6NQU9a1NSCMlSEIDUCgPozeW0dvbxMhgG6MDzQyYGzhZdYx4VRg+kh1EHvFHpQghJyUCwdhcgbHdhL69jlPNBjTVWuLVCSRkKkgryKSgSoumspDC8hOcrNLQ0GFAU1+KvCQDr/Qo5KVq1KXZ5GjS+ROj0HMwGVp7XQAAAABJRU5ErkJggg==";

/** 저장해 둔 아이콘 그림(RGBA)을 화면에 보일 그림 주소로 바꾼다 */
const urlCache = new WeakMap<StoredTemplate, string>();
export function templateUrl(t: StoredTemplate): string {
  let url = urlCache.get(t);
  if (!url) {
    const c = document.createElement("canvas");
    c.width = t.width;
    c.height = t.height;
    c.getContext("2d")!.putImageData(new ImageData(Uint8ClampedArray.from(t.rgba), t.width, t.height), 0, 0);
    url = c.toDataURL();
    urlCache.set(t, url);
  }
  return url;
}

export function gameIconUrl(id: GameIconId): string {
  return templateUrl(gameIcon(id));
}
