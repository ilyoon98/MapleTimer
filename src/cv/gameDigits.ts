import { GH, GW, type DigitTemplates } from "./digits";

/**
 * 실제 게임 화면에서 모은 버프·쿨타임 숫자(노란 글자, 검은 테두리)의 평균 모양.
 * 2분 동안 버프칸을 녹화하고, 1초에 1씩 줄어드는 순서로 값을 맞춰 붙인 숫자 1260개로 만들었다.
 * 이 모양만으로 녹화한 숫자의 98%를 맞게 읽는다 (학습 전에도 바로 쓸 수 있게).
 * 숫자마다 GW×GH 칸을 0~35 (36진수 한 글자)로 저장.
 */
const ENCODED = [
  "0syyzzx100kyy83yzw00tyd112zy50vy1011py50ww1001my60ww1001my50yw3011my50xw1111ly50ww1111ly50ty5101vy50tyw10kyy502yyyyzza0002ryyz30000000000000", // 0 (51개)
  "0000xzf00000czzzl00000zzzzl0000000wzl0000000ezl0000000ezk0000000ce20000000dzk0000000dzk0000000czk0000000czk0000000bzk00000000xk0000000000000", // 1 (490개)
  "1yyyzzy10007r2rzz600001111zh00000011yk00000001za0000000yz4000000rzy000000mzz1000001yz2000000yyb100000yyy3100009yyyzzz4000yyyyzz1000000000000", // 2 (112개)
  "0wzzzzt0000j90lzze0000000lze0000000ize0000000lze0000ezzzze000kzzzzza0000000mze0000000lze0000000lze0000005zze000zzzzzz1000lzzze00000000000000", // 3 (93개)
  "0000mzd0000000zzw000000tzzw000004zzzw00000ozzzw0000czzzzv00003a33a90001zzadzw300ozzdzzz900szzzzzzx00mpppqzyp0000004wy00000000qv0000000000000", // 4 (52개)
  "0yzzzzzs000zzz4000000zz10000000yz00000000yz80000000zzzz200000yzzzzzc0000000pzw00000003zw00000006zw0000000zzw000yzzzzz20009zzzm00000000000000", // 5 (91개)
  "0hzzzzzk00izzzb00000tzg0000000yz10000000yz10000000yzzqx40000zzzzzzzj00zzc00hzz60yz0000tz70xz6000uz60wzo00pzz30jzzzzzza0001tzzs20000000000000", // 6 (101개)
  "yzzzzzzw0000008zzz0000000uzt0000000yz1000000nzj0000000yz20000006lg0000000jzg0000005yz1000000jzg0000002su1000000jzg0000000wgb0000000000000000", // 7 (89개)
  "0xzzzzy300uzz33yzy10yz3000yz30zz1000wz30wzu00tzy10rzzzzzz8001zzzzzy100tzz20wzh00xz6007zz30xz3000zz30xzl00tzz30nzzzzzz90001wzzq20000000000000", // 8 (93개)
  "0tzzzzz600pzy73yzy10uy6001zz60xy1000tz60yy6001yz70syf11rzy70kyzzzzzy6000012szz60000000sz60000000xz6000000xzz10ozzzzzz1001tzzz800000000000000", // 9 (88개)
];

let cache: DigitTemplates | null = null;
export function gameDigitTemplates(): DigitTemplates {
  cache ??= ENCODED.map((e) => (e.length === GW * GH ? [Float32Array.from(e, (ch) => parseInt(ch, 36) / 35)] : []));
  return cache;
}
