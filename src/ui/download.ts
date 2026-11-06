/** 앱 설치 파일 주소 (화면·DOM 없이 테스트할 수 있게 버튼과 나눠 둔다) */
const REPO = "ilyoon98/MapleTimer";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

/** 가장 최근 릴리스의 설치 파일(.exe) 주소. 파일 이름에 버전이 들어 있어서 누를 때 GitHub 에 물어본다 */
export async function latestInstallerUrl(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const release = (await res.json()) as { assets?: Array<{ name: string; browser_download_url: string }> };
    const exe = release.assets?.find((a) => /^MapleTimer-Setup-.*\.exe$/i.test(a.name));
    return exe?.browser_download_url ?? null;
  } catch {
    return null;
  }
}
