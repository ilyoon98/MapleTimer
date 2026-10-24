import type { StoredTemplate } from "./match";

/**
 * 실제 게임에서 찍은 버프 아이콘 (사용자가 따로 등록하지 않도록 프로그램에 넣어 둔다).
 * - 솔 야누스 : 새벽: 버프 즐겨찾기 칸의 아이콘 (45×46)
 * - 에르다 파운틴: 위쪽 버프칸의 아이콘 (43×43)
 * 칸에 따라 크기가 조금 달라서 찾을 때는 크기를 조금씩 바꿔 가며 비교한다.
 * 숫자 부분은 빼고 비교한다 (남은 시간이 계속 바뀌므로). RGBA 를 base64 로 저장.
 */
function decode(width: number, height: number, b64: string): StoredTemplate {
  const bin = atob(b64);
  const rgba = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) rgba[i] = bin.charCodeAt(i);
  return { width, height, rgba, ringOnly: false, matchMode: "noText" };
}

export type GameIconId = "janus" | "fountain";

const JANUS =
  "lJei/5WWo/+VlqT/lpaj/1tbY/8cHSL/HB0h/xsdIP8bHh//Gx4f/xseH/8bHh//Gx4f/xseH/8bHh//Gx4f/xseH/8bHh//Gh4g/xoeIP8aHiD/Gh4g/xoe" +
  "IP8aHiD/Gx4f/xseH/8bHh//Gx4f/xoeH/8aHh//Gh4f/xoeH/8aHh//Gh4f/xoeH/8aHh//Gh4f/xoeH/8aHh//Gh4g/xkeIv9kaXL/lJyp/5afsP+YobX/" +
  "k5en/5SWp/+Vlqb/YmNw/y8xOP8MEBT/DBAU/wwQE/8MEBL/DBAS/wwQEv8MEBL/DBAT/wsQE/8LEBT/CxAV/wsQFf8LEBX/ChAW/woQFv8KEBb/ChAW/woQ" +
  "Fv8KEBb/CxAV/wsQFf8LEBX/CxAV/wsQFf8LEBX/CxAV/wsQFP8LEBP/DBAS/wwQEv8MEBL/DBAS/wwQEv8MEBL/CxAT/wsQFf8yN0D/Zm16/5WesP+WoLf/" +
  "kpar/5SWqf+VlqT/DhAZ/xwgJv/Axsv/vsbN/73Hzv+9x87/vcfO/73Hzv+9x8//vcbQ/73G0v+8xtT/vMbV/7zG1f+8xtb/vMbW/7zG1v+8xtb/vMbW/7zG" +
  "1v+8xtb/vMbW/7zG1f+8xtX/vMbV/7zG1f+8xtX/vMbV/7zG1P+9xtH/vcfP/73Hzv+9x87/vcfO/73Hzv+9x87/vsfN/7/Gzf8NFBv/FBwm/5efr/+Xobn/" +
  "k5aq/2Nldv8NEBv/PkBH/1hbYP89Qkb/QUlP/2dxeP+Fj5b/fIWO/1Vfaf9ASVf/Qktb/1Vecf9aY3n/WmN5/1pkd/9aZHb/WmR2/1pkdv9aZHb/WmR2/1pk" +
  "dv9aZHb/WmR2/1pkdv9aZHb/WmR2/1pkdv9aZHf/WmN5/1pjeP9SXG3/QElY/0BKVv9aY27/fYeP/4eQl/9ganH/P0dO/ztBR/9JT1b/KDA5/xAaJ/91fpT/" +
  "WFpo/y0vOf8fIyv/Vllf/01MT/8PDxD/MTI0/0lMT/9SVlj/QERK/ygsOP8cIDH/HSA2/y0wSf8xNU//MzhP/z5CUv9sb33/hYmW/4WJlv+FiZb/hYmW/4WJ" +
  "lv+FiZb/hYmW/4WJlv+FiZb/hYmW/2Vodv89QFH/MzhP/zE1T/8rLkX/HB8z/xwgMf8qLzv/Q0hN/1VaXP9FSUv/LC4x/woKDv9FSE7/OkNN/xUgLf8sNEL/" +
  "HR8p/woNE/+3vMP/QUVL/w8PEP8nJCT/XFxd/0tMTv8nKS3/FBYe/ygqOv8zNUn/MzRL/zY3Tv9CRFv/UVNo/2Vmdf+/wM3/8PD//+np+//p6fv/6un7/+rp" +
  "+//q6fv/6un7/+np+//p6fv/8PD//7S0wv9jZHP/T1Fl/0BBWP82N03/MzVK/zM1Sf8mJzf/Fxkh/ykrLv9RUVT/VVVW/yAfIf8LDRL/PklV/3OAjf8ABg//" +
  "Hh8n/wkNEv+1vcX/RExT/y8xM/9gX2D/Ly8z/xsdJP8bHCr/LC0//zEySP8zNUr/NjdK/0dJWf+UlaP/3N3r/9/h7//Iydv/oKC5/3NykP90cZH/dHGS/3Rx" +
  "kv90cZL/dHGS/3Rxkf90c5H/pqa//8rL3f/e4O3/29zp/4eIlv9FR1f/MzVI/zM1Sv8wMUb/KSs6/xgaJf8dHiX/NjY6/2VlZ/8lKS7/QU5b/3KBj/8ABg7/" +
  "Hh8m/wkOEf+0vcX/anN6/0lMT/9LTE7/HR4l/xobKP8nKDv/MjNJ/z4/VP9mZ3r/oaOz/6yuvP/AwdD/x8fZ/6emvP+LiaX/dnOX/2Vgif9mYIv/Zl+L/2Zf" +
  "i/9mX4v/Zl+L/2Zgi/9mYYr/d3SY/46Nqf+qqr//y8vb/72+y/+rrLz/n6Cy/15fcv89PlL/MTNG/yYnOP8YGiX/IyQr/1FRVP9GTFD/YXB+/3GBj/8ABg3/" +
  "Hh8m/wkOEf+0vcX/h5CX/1NXWf8nKS3/HB0q/ycoOv82N0v/OzxO/2hpdv+lp7P/5uj3/9fY6/+0tMz/i4mn/2RehP9gWIT/aV+P/3luoP96baD/em2h/3pt" +
  "of96baH/em2h/3ptoP94bZ//Zl2N/19YhP9nY4n/j46q/7q60f/Y2e3/5uf4/5ucqP9hYm7/OjtN/zU2Sv8lJjf/HB0o/ykqLf9ZXmP/eYmX/3CBj/8ABgz/" +
  "Hh8m/wkOEf+0vcX/foiQ/0JHTP8TFRz/LC0+/zI0SP87PE3/UFFg/76/y//c3ev/qam+/25siP9dWXz/YFqC/3FolP91aZn/em2g/4V3rf+Gdq7/hnav/4Z2" +
  "r/+Gdq//hnav/4Z2rv+Fd63/eWyf/3Rqmv9vZ5P/X1qA/11ae/92dJH/sK/G/+Lj8P+vsLv/TU5d/zg6TP8yNEf/KSo5/xESGf9ITlX/coKQ/3CBj/8ABgv/" +
  "Hh8m/wkOEf+0vcX/VmBq/ygsN/8pKzn/MTJH/z4/U/9maHT/v8DL/8bH1/+npr7/cm6R/2xlkP9rYpD/fHKf/7Ooz/+6rdX/pJbF/3tsoP97bKT/fGum/3xr" +
  "pv98a6b/fGum/3tspP9/cKT/qpzL/7mt1v+socn/dmya/2tikP9tZ5D/c2+R/6+uxf/ExtX/tbbB/1tcaP89PlL/MDFF/ykqN/8nLTn/UGBw/3CBj/8ABgv/" +
  "HR8m/wkOEv+0vcb/RE1Y/zk+Sv97fYv/Q0RX/2Znef+nqLL/2drl/6emvP97eJj/ZF2J/3Zsnf+Mf6//raDK/+PZ9//p3/v/0MTp/52Pvf+Vhbz/koG8/5KB" +
  "vf+Sgb3/koG8/5WGvP+gk8D/1srv/+nf/f/c0vL/p5rG/4l8rv90aZr/Y1yH/397nP+vrsT/09Tf/6Chq/9eX3D/Skte/4ODkf8uM0H/QFFi/3CBj/8ABgr/" +
  "HR8m/wkOEv+0vcf/Rk9b/2pudv/h4uv/W1xp/56frf/n6fX/qKi5/3JvjP9jXIT/eGyf/4J0p/+wos3/49f3//74/////P//9Or//9jL7v+9rt7/s6Tb/7Oj" +
  "3f+zo93/s6Tb/7+x4P/az/D/9/D////8///69P//3tL0/6iaxv+Bcqb/dmqc/2Fagv95dpL/sbDA//Dx/P+Njpv/bW16//P0/P9TWWP/QlJk/3CBkf8ABgv/" +
  "HCAm/wkNE/+0vcn/WWJw/2Nmcf+trrf/YmNt/6mqtv/a2uv/bmyF/21mi/92bJr/gnWo/3ttnf+qnsD/4tnu//36/////v//8+34/9TL4f+YjK//hHei/4R3" +
  "pf+Ed6b/hHel/5+Tuf/Z0ej/9/L9///+///69v7/3tTs/6KVuf99bp3/gnWn/3Rqlv9rZYj/fHmQ/+no9/+bm6b/a2t1/7a3wP9UWmf/UmJ2/3CBk/8ABgz/" +
  "HCAm/wkNE/+0vMv/XWV5/0dLXf9yc4L/oaKr/6qqtv+WlKz/aWOG/3Zrmf9/cqT/fG+e/2dcg/9aUmn/XFdh/3Vzc/94d3T/bWps/1NOVv87NkT/My1A/zUv" +
  "Rv84Mk3/PDRT/0dAWf9WUV7/cG1y/3h2dv9ycHP/WlRi/1tTbP9lW37/bWKM/3lunP9zaZP/cGuK/5yar/+qqrX/m5ym/2xtff9ARlz/VmaA/3CAlf8ABgz/" +
  "HCAm/wkNFP+0vM3/XWV6/zU4TP9PUGD/2drj/6emtP9dWHb/cmmT/4Bzpf98bqD/Z1yF/z83T/8hHBn/HhsG/yYjBP8mJAD/JCEA/yAeAP8gHAD/HRoE/xkW" +
  "DP8PDAz/EQ0X/xQPFf8SDgH/HhoA/yQhAv8iHwP/FREB/x8ZF/84MD//RTxZ/2xhif95b5n/cGiN/1tWcf+1tMH/yMjS/z4+UP8zOE//VmaB/3CAlv8ABg3/" +
  "HCAm/wkNFP+0vM3/XmV5/z5BUf9iY3D/397p/6iltv9eV3j/c2mU/4BzpP9tYI3/QTlY/yEdH/8zLgb/WFQN/2VgBv9lYAD/ZGAA/2RgAP9jXwD/YFwJ/01K" +
  "E/8PDgD/BQMA/xEPAP8rJwD/SkUA/1xYAP9cVwP/NC8A/x4aAP8TDgD/EAoT/0lCXf9sY4j/cGiN/1xVdP+2s8T/zs7Z/1NTYf86QFL/VmaA/3CAlv8ABg7/" +
  "HCAm/wkNFP+0vM3/XmV4/2tue//Bwc3/sa++/4F8k/9iWn//fnOh/35wov9sYIv/PTdQ/xcUDf9XUx//o55K/7WvR/+5s0D/t7I//7izOP+6syv/uLE1/5SQ" +
  "Of8ZFwD/BQQA/zQyD/+hm07/sKlD/7awRP+2sEP/qaI6/4V+K/9OSh3/EAwA/y4oNv9UTW3/enGX/11Wef+JhJv/tLLB/8TD0P9cYnH/V2Z//3CAl/8ABg//" +
  "HCAm/wkNFP+0vM3/XmV4/4KFkv/w7/3/jIqf/2ljgv9rYYv/g3eo/3xuov9xZZH/RT9Y/xQRD/9GQh7/gn1B/5CLQP+Tjjr/k445/5qUKf/Mwi7/29E+/7Gq" +
  "RP8fGwD/BgQA/zc0Ev+knFX/m5I5/5WONv+eljH/yL48/8G3Pf+EfjH/Ew4A/xgTFv9EPVn/f3We/2deh/9sZoP/mZer//38//9uc4P/V2Z//3CAl/8ABg//" +
  "HCAm/wkNFP+0vM3/XmZ4/4KFkf/t7fv/dnOL/2Zfgv95bpv/hXeq/4FzpP9+cpv/YFlz/xwXH/8PCwD/DwoA/w4JAP8OCQD/Eg4A/yYfAP+nnAb/yr8o/56X" +
  "NP8fGgD/BwQA/xcTAP89NgD/HRYA/xAKAP8qJAD/kIYA/8zBNv+knUL/FQ8A/w0IA/89N0//g3ii/3dsmf9kXX7/hYOZ//v7//9uc4P/V2Z//3CAl/8ABhD/" +
  "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" +
  "ICMe/wkOEf+0vMz/XWV7/zI2Tv9LTGD/2Nnj/6ems/9dWXX/cmqS/39zpv+Acqf/dGiX/09Gaf8dGSf/Dw0F/yUiAf8kIAD/FxME/w8JEf82LU7/Rzxp/0U8" +
  "Z/8bFDL/EQ4R/xQSAP8hHgD/JyQA/ykmAP8oJQD/Ih4A/xwYAP8cGBP/IBkp/2FXev95b5n/b2iM/1tXcf+1tML/xsfU/zk6UP8wN1L/VmWC/3CAlv8ABg7/" +
  "ICMd/wkOEf+0vMr/XWV6/zE1TP89PlL/goSP/6mqtv+npLz/Z2KE/3Jplv99caP/fXGj/2xhiv9LRVz/KCQu/x0cGv8uLCr/SkZN/11WbP9mW4T/ZViL/2NX" +
  "if9ORG3/LylC/x8aJ/8bGBv/FhQP/xIRCv8VFA//IR4h/yolMP89NU3/W1Jz/3Jokv9wZ5H/cGqK/6+tw/+np7X/enyJ/zQ2TP8vNlD/VmaB/3CAlf8ABg7/" +
  "ISMe/woNEP+0vcf/VV5t/0RHV/9wcX//UVNf/6eptv/d3u//fn2W/25pjP9yaZX/gHOm/3lrmv+Adpb/dm+B/2xqbv+AfoH/n5qn/7mwyv+ajrj/jX6y/4x+" +
  "s/+Mf6//al6G/1xSb/9lXm3/Yl5j/15dXf9iYGP/bWZ1/2BWcf9eUXr/gHSh/3BnkP9waoz/i4ig/+rp+v+XmKf/VVZk/3R1hf87QVP/Tl50/3CBk/8ABg3/" +
  "ICEd/woNEP+0vcb/RE1Y/2pudv/n6PL/WVto/5mbqf/p6/n/wsPU/3x6lf9iXYP/dWqb/4J1p/+tocj/3tXx//z3////+///8ur//9TJ7P++sN7/uKje/7io" +
  "4P+4qN//uKnb/8G03f/XzOn/9u/////7///48v//29Hu/6aawf+Ac6T/c2iY/2FagP+Gg57/yMfY/+/w/P+Jipr/a2x7//n5//9TWWT/QFFj/3CBkf8ABwz/" +
  "ISEd/woNEP+0vcX/RE5W/1FWWv+wsrn/Tk9f/1pcbP+ZmqT/5+jz/7u70P+Kh6f/YVuG/3Nqmv+EeKf/opbA/93T8//j2fj/x7rh/4+BsP+Le7H/iHiy/4h4" +
  "s/+IeLL/iHix/4t7sP+UhrP/z8Po/+PZ+P/Vy+v/mY65/4F2pv9waJf/X1mD/5CNq//Dwtb/3d3o/46Qmv9TVWb/W1xs/729xP9BR07/QVFg/3CBkP8ABwz/" +
  "IiEd/woNEP+0vcX/X2lw/0ZLTP9dYGT/PD5N/z0+UP9eYGv/qaq1/8rL2/+6utH/goCh/25okf9oX4z/d2ya/6abxP+rn8n/nY+//39wpf9/b6n/f2+q/39v" +
  "qv9/b6r/f2+q/39vqf+Acab/oJLD/6ufyf+glb//cGaV/2dfjf9wa5P/h4Wl/8LC2P/HyNf/oKGs/1RVYf87PE7/QUJR/2JiaP9ARkr/V2h1/3CBj/8ABwz/" +
  "IiAd/woNEP+0vcX/gYqR/0ZLTP8YGh7/KCo4/zAxRP86O03/TU5d/66vuv/Y2eX/wcLV/4SCnf9rZYn/Zl6I/25mkv9wZ5X/d2ue/4N0q/+DdK3/hHOu/4Rz" +
  "rv+Ec67/hHOu/4N0rf+DdKv/dWic/3Bmlf9tZZD/ZV2G/21oi/+Mi6X/x8fa/9rb5/+hoq3/SUpb/zc4S/8wMkP/Jig0/xYXG/9MUVb/dIWS/3CBj/8ABg3/" +
  "IiAe/woNEP+0vcX/iZKa/1ZbXv8qLTH/GBom/yQmN/80Nkr/NzlL/1dZZf+cnqn/9Pb//+vs//+6uNL/gn2e/15agP9bVoD/ZVyL/3Zsnv93a57/d2uf/3dr" +
  "n/93a5//d2uf/3drnv91apz/Y1mJ/1xVgP9kXoT/hYGh/8TB2//s7f//8vX//46Qm/9SVGH/NzhM/zM1Sv8hIzP/GRsm/y0uMv9cYmf/e4uZ/3CBkP8ABg3/" +
  "IiEe/woNEP+psbr/X2hx/0JITf9PUlf/HyEr/xcaKP8iJTf/MTRI/zo8Uf9WWGz/f4OU/4qNnv+rq77/wL/T/6+uxv+Ih6T/bWqN/15agf9dWoL/XVqC/11a" +
  "gv9dWoL/XVqC/15agv9gWoP/b2qP/4+Mqf+zscn/wsHV/6aluP+KjZ//fYCT/09RZf84O1D/LzJG/yEkNv8WGSf/JScw/1ZXW/8/RUv/VWV0/2x8jP8ABw//" +
  "IiIe/wwPEf+aoqv/QEpU/ysxOP9KTlX/NDhB/yQpNf8eIzL/Jys//y4ySf8wNEz/MjdM/z9EV/9zdoj/pae6/6msv/+doLX/i42o/3Z3lf91eJX/dXiV/3V4" +
  "lf91eJX/dXiV/3V3lf94eJf/j4+r/6GiuP+qrL//pae6/2lsf/89QVb/MDRL/zA0TP8sMUj/JSo+/x0hMf8lKjb/NjpD/01RV/8hKDD/O0lZ/2Nxgf8ABw//" +
  "IyMf/wsND/+CiZL/PUZS/xkfKf8eIy3/TVNe/0FIU/8nLjz/Fh0u/yUsQf8uNU3/LTVO/y01T/8uNU//MjhR/0BHXP+Ij6P/srnO/7K5zv+yuc7/srnO/7K5" +
  "zv+yuc7/srnO/7K5zv+zuM7/s7jO/3+Fmv8+RFn/LzZP/y41T/8tNU7/LTVN/y41Tf8jKj//GCAw/ykwPv9GTFj/R01Y/xccJ/8QGCT/NEFQ/1djcf8ABw//" +
  "dHRu/zs9PP8LERf/PkZQ/0NKVv8XHy3/JC08/zZAT/9AS1v/N0NU/yUvRf8cJz//HShD/yYxTv8pNFL/KjZS/y04Uf8+SV//R1Jo/0dTZ/9HU2f/R1Nn/0dT" +
  "Z/9HU2f/R1Nn/0dTZ/9HU2f/R1Jo/ztHXf8tOFH/KTRR/yk0Uv8kMEv/HCdA/xwnP/8oM0j/N0NU/0FMXP8yPUz/ISs6/xQdLP88RVP/KjRB/woTHv9GS1T/" +
  "oqOa/3Z4cv8fIyL/JSsw/yw2Qv8zP1H/MkFW/0BQZv9MXHL/SVpw/zpKYv8yQlv/M0Nd/zpKZf87TGn/O0xq/ztMaP87TWj/O01n/ztNZ/87TWf/O01n/ztN" +
  "Z/87TWf/O01n/ztNZ/87TWf/O01n/ztNaP87TGj/O0xq/ztMaf84SWT/MkJc/zJCW/89TWX/SVpw/0xccv8+TmP/MkFV/zM/Uf8mMD7/IScw/youNf+TlqL/" +
  "oqSZ/6Gjmv+ho53/Gh8e/xMbJP9EUF7/QlBi/0JQY/9CUGP/QlBj/0JQY/9CUGP/QlBj/0FQY/9BUGX/QFBm/0BQZv9AUGb/QFBm/0BQZv9AUGb/QFBm/0BQ" +
  "Zv9AUGb/QFBm/0BQZv9AUGb/QFBm/0BQZv9AUGb/QFBm/0FQZf9BUGT/QlBj/0JQY/9CUGP/QlBj/0JQY/9CUGL/QlBg/0RQXv8OFiD/KCww/7CyuP+1t8X/" +
  "oqSY/6Kkmf+hpJn/goV+/zA1NP8BBwr/AQcM/wEHDf8BBw3/AQcM/wEHDP8BBwv/AQcL/wAHDP8ABwz/AAcM/wAHDP8ABwz/AAcM/wAHDP8ABwz/AAcM/wAH" +
  "DP8ABwz/AAcM/wAHDf8ABw7/AAcO/wAHDv8ABw7/AAcO/wAHDv8ABw3/AQcN/wEHDf8BBw3/AQcN/wEHDP8BBwv/AQcK/wEHCv9ARUf/kJOV/7Gzuf+0t8b/" +
  "oqSY/6KkmP+ipJj/oaSZ/29xav8yNTD/MjQw/zI0Mf8yNDH/MjQw/zM2MP8zNjD/MzYv/zI2L/80ODD/NDgw/zQ4MP8yNi//MzYw/zM2MP8zNjD/MzYw/zM2" +
  "Mf8yNjH/MjYx/zM3Mv8zNzP/Mzc0/zI2M/8yNjP/MzUz/zM1M/8zNTT/MjQy/zI0Mv8yNDL/MjQx/zI0Mf8zNjH/MzYx/zQ3Mv+Agn//ra+v/7Gzuf+0t8b/";

const FOUNTAIN =
  "HBoc/xsZGv8QEBD/DQ4P/w0OEf8NDhL/DQ4S/w0OEv8NDhL/DQ4S/w0OEv8NDRP/DQ0T/w0NE/8NDRP/DQ4T/w0OE/8NDhP/DQ4T/w0OE/8NDhP/DQ4S/w0O" +
  "Ev8NDhL/DQ4S/w0OE/8NDhP/DQ4T/w0OE/8NDhP/DQ4T/w0OE/8NDhP/DQ4T/w0OE/8NDRL/DQ0S/w0OEv8NDhL/DQ4R/w8PEf8YFxn/Gxoe/xwaG/8TEhP/" +
  "AAEC/z9AQv+qq6//qaux/6essv+jrbX/n666/5yvvv+br8H/mq/D/5mvxf+Zr8X/ma/F/5qvxP+br8L/nK/B/52uv/+err3/nq+8/56vu/+er7v/nq+8/52v" +
  "vf+cr7//m6/A/5qvwv+YrsL/mK/D/5mwxP+ZsML/m7C//56vu/+irrb/pa2z/6essf+nqq//qauw/2prb/8BAgX/CwwO/xoaHv8NDA3/CgoL/0ZHSf+XmZz/" +
  "ysrO/8fL0P/AztT/rMfT/4+60P94r87/aqbN/1mYx/9Ghrv/RYa8/0uLvv9Rj8D/VI+8/1eOuP9gkrf/b5+//3Skvv94qL//eKi//3eowf9tnrz/Ypa5/16X" +
  "vv9Ukr3/T4+9/02Qv/9Iirn/XZ7I/3m11f+NvtT/rMzY/7zQ1v/CzdH/xszP/8jLzv+oqq3/S09S/w8SFf8ICQz/ERET/zEyNP+oqav/zM7R/9TY2//M2uD/" +
  "t9Th/5TE2/9rrtT/T5zQ/0GO0v85iNT/OYnY/zmJ2P89jdn/RJTX/0+b0f9fo8//c6nO/4S00v+JudH/jLzR/4y80f+LvNP/gbPQ/3Gqzf9epMz/SZnK/z+U" +
  "0P89k9j/Oo3W/0CQ1/9OmNj/Y6XX/4m+3v+lzuD/tdLb/8fZ3f/Q2dv/ys7Q/6yxtf87QET/ERMW/ygoLP+2t7r/0tPV/9PX2f/M2Nv/vNnj/5DF3v9jrNX/" +
  "PpLP/yuA0f8jbtL/LXPe/1GX/f9SmPn/UZn2/1eg7P9xven/mdfv/7/e7f/K2uT/ytzj/8vc4v/L2+L/ydri/8jb5f+31+X/kMvf/2u22/9Tp+b/S53w/0+Z" +
  "+f84fOT/JGXS/ytuz/9Jk9b/arHb/4nD2f+u19//yNrd/9HY2f/S19v/pqqu/zs+Qf8oKC3/tLe8/8/U1//M2t7/udbf/5TF2v9jrNL/OpLH/x9+v/8dd8n/" +
  "Bk+1/wA3qP8GPK7/Bj2p/wNBoP8MUp3/TZzJ/4rL4//C3+j/0Nrc/9PZ2v/U2dn/1djZ/9TZ2f/R2Nn/wtzi/6Xi8v9qu93/LoLA/wBGm/8EP6X/Ajeq/wAy" +
  "r/8AOqr/E2m4/zuVyv9nt9n/iMbZ/6/T3P/K3OD/z9jd/6Wqrv87QEL/KCgt/7K4vv/I1tv/tdPe/5DF3f9jrNL/OpLG/zCQyv83mM3/PJXP/0CH0f8tYb7/" +
  "AiOW/0dp1/9Shtf/PoXE/yuCu/9VptD/l8ja/8Tf5P/M3N//0Nrc/9Ha2//P2dr/zNrc/7LX4f93x+L/OZnE/y6Evv9Chc//XoXg/zBRuP8GNqX/J2vO/zKL" +
  "0P82l8v/OJfG/2Cz1/+Kx9r/rNPc/8ja4P+kqq7/O0BC/ycpLv+rt7//ttPf/5PE2v9krdb/OpHJ/y2Iyv9Am9z/Y7fs/3C67v+Avvn/cZ/q/zVPsf9yj/D/" +
  "frb+/2y48v8vib//P5W+/3S0x/+04+z/sdXb/7jV2v/B3eH/tNDU/7fX3P+f09//UKvF/ymQuP9BnM//eb7//4it//9detX/O2nD/2uq+/9jtPX/SaXg/yqI" +
  "yP9DnNX/ZbHW/47F2v/A2+X/oauw/zpAQv8lKTD/oLXC/5DC2f9krNP/OY/O/x95xP9InOr/a7T//43D//+p1///n8///57K//+x0v//NF+i/xxlqv9Tq+X/" +
  "csrs/2W5zP9tuMb/pOr1/3e5xf+BwMz/ot/q/3Svuf+NydL/kdnk/0+tvf9hyOL/YMPs/0eZ1P8SRZT/XITV/6TS//+Rx///g8T//3C4//9WpPr/L4DR/0GT" +
  "z/93ueH/uNvu/52ttP85QUT/JCox/5iyxP9zstT/RpzP/yeFzP8Yc8j/El27/xtWsv8vWab/PWCj/zlemv9Vfrb/oc3//26o5P86i9X/L4bF/4fT7f+I0d3/" +
  "c8PX/2u90v+Azd//f8ra/3K+zP+G0eL/e8bc/2++0v9yyNT/g97x/1+75f8nebj/T4/d/36y/v+Es+v/N2Wa/ytcn/8gV6r/D1K2/wBIrP8Yarz/UpvV/5XF" +
  "4v+MqLP/NkJG/yMqMf+Sr8T/YaTR/zONyf8jhMb/Loba/wBBsf8HOqv/KVit/0Jrr/9Pbaz/Vnq5/2Cb4P9Vn+v/MYPb/yVwuP+Zz+3/n9fp/22+4/83jLP/" +
  "iMzl/4zL3f9jrbz/kuH3/2e03f9QmsD/ic/d/5zg9P9qr+f/HGOv/0mT5P9bnOr/YI/R/01xsP9MbbL/O2O2/xZRvP8ANqf/BlS5/zqG0v91td3/d6S1/zFE" +
  "Sv8jKjP/j6zG/1GXzv8sh8v/Mo7Q/1qq9/8gVr3/OmPM/3mj9P+ewv//uM///5W08v8qZ6b/HWqu/xVntP8vdbT/o83o/6rT6f9rsN3/FGGR/3e52f+JyN//" +
  "a7HD/4/Z8/9Qmsv/OHmo/5fK2v+r3O7/drDj/x9hpP8dZ6n/JWeo/1R/vf+10v//s8n//5a0//9ik/H/EVG0/w9ZvP8zf9P/W6HY/2qevP8wRE7/Iyk0/4qn" +
  "xv85fr//PJLg/1ys8f98vf//jrj7/6TA//+bs/b/QVWW/4qa2P+30f//lsfu/3y/4v9brNX/WaHE/63U6P+92vH/ibbh/yJcjf9Qlr//ecLh/5TW6/93tdD/" +
  "QX+w/0Z6qP+21ef/vN7q/4vD4f9Tl7z/cLLT/4nA4/+lyPL/v9X//2R0v/9ec8D/pcr//3eu6f9bo+//S5fn/zp7xP9cir7/MEJU/yMpNf+Ho8T/Km2w/x1q" +
  "u/8vbLT/Q3Kx/2mJv/+asOj/t8b//3uH1/9qeMz/conQ/5G55P+a0er/dbfL/0qElP9FY3H/V2p9/1Rujv88Y4r/OHKY/1KQsP9rnbL/MFxx/yhScv86XHb/" +
  "YXJ1/0dbWP8vWmD/NGl1/12Pm/+Bq8b/iafc/2V6xP9redT/jJzx/7bS//9vmMv/P3i7/yZhrv8ZS5f/VHex/zJBVf8iKjX/h6PC/zFwrv8dXqz/LVGd/zdO" +
  "lf9OZqf/dYrS/5qn//+Xo///Q1PU/x43q/9Qdb3/f6fO/2aImv8uSE//DyAo/woWIP8LFyP/IDJD/ypHYf8zUmv/M0tb/wsdJP8QHx//FCAT/x0lCP8ZIgP/" +
  "DyAL/wogF/8qQkf/TmmP/ztZtf8KJJv/Z3bt/5ek//+Rpfn/YXvD/0Jfp/80UJb/N0+R/2V2p/83QFD/Iio1/5Cryv9YktL/f7n//7HK//+6xv//t8r//26A" +
  "1v8dJ4L/HCaM/xIhmf8JHov/CCVo/y1HZP8dKyj/DxYA/w4VAP8JDgD/CAwA/w4UDf8FEBj/BhIY/w8VCf8KDAD/KSgA/0lICP9dXhX/YGIb/05QE/8nLAX/" +
  "ERsT/xorTv8AGHH/ByCQ/xYjjv8cJov/JzWR/5io//+6yf//usj//73I//+ZotT/OT9Q/yMqNf+MpMb/PHK6/zBnyP9DX8v/SlnL/0tZy/9pddf/jpTY/5CV" +
  "zP+AicT/W2eY/x4uSP8NGxb/KC4E/1ZXC/+Eghn/kpAq/2xtK/8MDgD/BgoA/xcZAv9APQD/fnkc/6CbJ/+zry//t7Qz/7u5Pf+uqzv/hYY2/x8mC/8VIjD/" +
  "PE13/4KSyv+Nls7/jpTV/4eP4P9bZsb/S1rI/0pax/9NXLf/bnq4/zc/VP8jKjP/kajE/1OFv/85cL7/O2C5/0Jawf8bLKP/ZG7W/83S///Q1ff/qrTQ/2Zx" +
  "gv8JEBD/JysM/2FhFv+joC3/zccx/9/ZSv+ko0X/DQ4A/wYGAP80MgL/hn8a/8G6N/+/ujP/rKkl/5iVG/+amCf/kpEr/3V4Lv8YIAj/GCUq/2Bygf/B0er/" +
  "zNf5/8zS//+9w///OUOh/yk8pv9EW7//SF2s/219sP83P1H/JCow/6K3xP+Zyd3/mNLs/6DT8f+gx/7/Mkmv/2Ju1//J0P//wMnu/4+ivf9RZG3/DRME/2Bf" +
  "K/+npT//29dL/9zWL//l30T/qqc//w0MAP8HBgD/VlQQ/9DKRv/IwjH/hYQZ/0BBAP8WFwD/EBMA/wwUAP8HEQD/Ag0M/yo7Q/97lqD/uNPn/7vM9f/Ay///" +
  "vMP//zhFl/9Zdr//p8r//7HM8f+Tp7r/N0FI/yYrMP+muL7/p9HV/57Y3P+Z2uH/ls7z/y1Nq/9gb9r/sbn//0xZi/9TcJL/TGd2/wkTCf8/PxL/aGYL/4eF" +
  "A/+dmQD/y8cv/6qnPf8NCwD/CAcA/19dD//b10P/pKEH/1VWAP8bHwD/EBQA/wkPAf8LFRH/ER0g/zpGT/95jZn/n8TR/4Sqxv9QaKH/a3nE/7rD//81R5T/" +
  "UXy3/6HS+/+12+7/la61/zdCRf8nKi//q7m//7TW3f+a0t3/eMja/2m04/8eR6j/XHDg/6ex//8nOIP/TXKo/1J5mf8OIS3/Iikc/y8yCP9GRwD/fX0A/7y8" +
  "NP+mpEH/DQsA/wgHAP9jYRH/39xH/56cAP9cXwD/NToA/zc7Af8gJAD/FBoF/xcfGf8xOj//XHKC/2mYsf+AsuL/NFKm/09gw/+4wv//MEmY/zVwtP93u+3/" +
  "l8rl/4mptv81Qkf/Jisw/6W4wP+kz9z/f8PW/1eyy/9Emsn/J16y/1Z22/+Kmv7/P1Kn/3KZ0/9mkrr/DCtK/yA0Qv8ZIhj/ISQA/3R2Bf+4uTn/o6JB/w0L" +
  "AP8JBwD/ZWIQ/+PeRf+zrwf/iooK/3h6Ev99fiD/X18P/0JDBf8nKQP/DxYN/yk+Sv8uXXb/lcf5/1Zzy/9Xas7/kaT+/zpfrP8udrX/UKHQ/3Gvzf93n7D/" +
  "M0NJ/yQrMv+SsL3/XqS6/0ikv/9DpcD/R6HH/3W89P9Sg8z/MUqj/5+0//+qzf7/fKjO/yVUg/9fhaj/RlZa/yEkAP97fAv/wMA9/6akQv8MCgD/CQcA/2Zi" +
  "Dv/s5UT/7OQr/+DbPv/b1kn/4txR/+DZU/+/tzn/fHgb/yUoBv8VJSj/HD9Q/5rA5v+wyP//eY/f/xs+jv9vpev/YrTj/0efwP9UnLb/aZmr/zFESv8kKzP/" +
  "k7G//2etxP9qxuH/cdLt/2/N7P9juuD/YKXY/2KK0P9QbrD/hq7W/5TF5/9Ujr3/PG2U/zNJU/8eJQD/enwN/8G/Pf+pp0T/DQsA/wkHAP9jYAz/5d4+/8C5" +
  "BP+VjwD/dnAA/2xmAP+mnhH/ysAk/7u0N/8vMAD/CRcT/yRCTP+oy+f/co3A/1V2tP9hldT/Y6rg/2XA5P9zzuj/g8zk/3qrvP8wREr/JSkw/6G0v/+Rv8//" +
  "jNDk/4LX7/9uzur/Sa/O/2G74P+Gwe7/RHGe/3Gmx/+RzOj/fLza/zhuhv8hPkf/FiIA/3Z6D/++vT3/p6VE/w0LAP8JBwD/YmAQ/9zYQ/+fmwD/WFUA/yUj" +
  "AP8WFQD/bWoH/7u0H//Tzkf/NDYA/wQSCP8iQkb/m8TZ/1+IsP9ajrz/i9L4/1SszP9VuNf/ddLs/5HW6/+Crbv/MkNJ/yYqMf+musX/q9zs/4DI3f9Wr8n/" +
  "PqO//z2nwv9dwN3/h9b3/47U9P98wd3/eb7W/5PZ7P9emKX/HT9F/wweAP9tcwv/t7c6/6OiQv8NCwD/CAcA/2NhFP/c2Un/o6AM/1FQAP8YFwD/EBEA/19g" +
  "A/+tqRf/zMlC/zQ3AP8DEwf/IEJD/3ipuf+Kxub/i9T4/3/W8P9Qssn/PqXA/0imwf9nsMf/cKCw/zFESv8kKzP/krPC/2Oyy/9Grs3/O6nJ/zqmxP9pzOX/" +
  "Y8Xf/0uz0/9MstL/W7XP/3HC1v+R2uj/aKOs/ylQUv8NIwD/bHUO/7a3PP+jokP/Dw0A/wgGAP9eXBH/2dVF/8fDIv+Khgn/WlgA/1JSAP+NjRT/urgj/7i4" +
  "O/8vNQD/ESQZ/zVaWv+LxtL/ZbnT/06wzv9RtM//bNHq/1m+2v9Co7//TaXB/1+ftP8tRU3/Iyw0/4yxwf9Ko7//NabI/0Kw0P9cxuT/Y8fi/1G40v84qcj/" +
  "QbHP/17B2v9uyN3/bMDT/1KYpv8eTFL/ByEF/2JuF/+vskn/oqJQ/w8OAP8HBwD/QkIF/6KgJ//HxDT/urc1/6imLP+ioSn/srI4/6qrLP+AhSL/HCoE/xEu" +
  "K/82aG3/itHf/2G/1f9CrMf/O6jF/1fC4P9jx+P/Yr/b/0yiv/9dnLL/LUVO/yMrNP+Mrr7/VqO9/0qqx/9gutT/d9bx/0Wy0f8zpMT/PqjG/1q+2f9ry+P/" +
  "YsPd/zqgw/8qgqL/C0FV/wAcE/9HVR7/jJFK/4SGTv8MDQD/BQgA/x8iAP9VVw//lpc4/7KyTP+8vFL/urlR/6WmRv95fCv/OEQP/wYfE/8MOkX/LXWH/3LI" +
  "3f9txNr/VLXP/zGkx/8xpMj/Xr/e/3/P6v9nqsH/bZus/zFETP8qMjz/iKS0/2imvf9xwdv/b7/Z/0Kbt/8xm7z/L5q8/0Kfvf9wyOP/VbHL/zqbuv8vl8H/" +
  "Em6Y/whGZf8AGSL/BxoA/xoiAP8aHgD/CA0A/wIOBf8FEgX/ERsA/xshAP8hJQD/JScA/ycpAP8fJQD/ER0A/wIZCf8AHSj/FE9o/zuPqf9AnLb/aLvU/2G5" +
  "1P8wmbz/Lpq+/zyauv9WpMD/jMfe/3qhsv83SFH/KS86/4KXp/+Br8L/Y6W9/0aXtf8viar/L4mr/0CWtv9YpMD/T5y3/zmRrv80kLH/QpzF/xhrl/8QVn//" +
  "FEhj/xArLf8MGQ//DRQO/xUhH/8nQkb/LEpN/yU8Nf8SIhT/DBUB/wgPAP8JEAD/Dx0O/w4oJP8JLzz/CT5f/yVqkf9DmLj/MIun/0KVsP9RoLz/VaXB/zuO" +
  "rf8viar/OIys/1aXs/9diJ3/MUNO/yIpNv9whZf/cJuv/0mGn/8re5r/KHyd/zmCof9Pkq//WZm0/zl8l/8yf5v/OIen/0aRtv8jbJb/Fl6M/x9dhf8nUWn/" +
  "Ij9O/yg9Sf85UFv/Tm98/1Bzf/9HZW7/MUlQ/y0/Rv8oOkL/HjdC/yNFVf8fSmL/EEVm/xhXgv8xeKL/Qo+u/zaEn/8wfJj/Qoej/2Gdtv9KiaP/M4Cf/yx6" +
  "m/81dpX/RnSL/yo9Sv8dJjX/WHKH/0R4kf8ucY7/I2yL/yhtjP9Jf5r/VIef/0qCnP8ybYb/PHaP/0N/mP8+e5j/KmuP/xdci/8OU4P/IWGL/ytjhf89bIT/" +
  "YYea/2eGl/9kgZH/XXyK/2aGk/9phpX/WHyQ/y5lgP8kZIf/HlyH/xBQff8dY4z/L3KU/0J8lf9GfpT/NHGL/zp1jv9Whpz/WIee/0F5lP8uaYf/LmeH/zpm" +
  "gP8lOUb/HCc2/1ZyiP9CeJP/LnGP/yxwj/87eZb/SnyU/0h2jf88cIj/Q3WN/1R/lP9bhJn/WIWc/zhti/8iYoz/GF+P/wxXhf8ZYIj/LmyK/0x9k/9ig5b/" +
  "Y4CQ/1d5iv9ghpf/W4GU/0V2jv8jaIr/EF2G/xFZiv8cYY//I2SJ/z52kv9bhJr/XYWZ/0p8k/9AdY3/Qm+G/1V/l/9VgZr/SniT/zZnhf89ZX7/JjlF/x0m" +
  "Nf9Zc4f/S3yU/zp4k/80dJH/NnWS/0N8lP9Cd47/QnSK/1R/lP9kgpX/bISX/2qEmf9Rd5D/NG6P/yBmi/8UXYT/IGmM/zF2j/9CfZD/XISW/1+AkP9TeYr/" +
  "XIiZ/1KClP9AeI7/LnOQ/xlkh/8XYYn/JWeN/z9xjv9YfZT/aoWY/2mFmP9VgJb/RXeQ/z1xi/9FdZD/VH2W/1p/mP9Kcov/SGh8/yg4Q/8eJjT/XXOG/1mC" +
  "l/9MgJj/PnaT/y1ohv83co//QHmV/0h8lv9Yg5v/ZIKX/22Clf9wgpX/aoSZ/097lf8za4j/MGuK/zd2kv89f5T/Qn2P/1aDlP9ZgZH/UHuM/1eGmP9OgpP/" +
  "Q3yQ/z99lv8ycY7/LmyL/zhti/9cgZr/Z4SZ/2eBlv9igZj/UXyW/0V4lf89dZT/NWmH/0tzjP9ggJf/YYCV/1Vtfv8qN0H/HiYz/2N0hf9si5z/WoGW/0Z1" +
  "kP82aov/Jl6D/yxli/85cpb/P3KS/013kf9dfJP/boOW/3CClf9pgZb/Y4CW/2CCmP9SfJH/R3uN/0Z8jf9MfI3/THqM/0p6i/9LfI7/SHyN/0d7jP9Jeo3/" +
  "VYCV/2CCmP9jgZf/aISZ/19/lv9SeJP/RHKR/z1xlP8yaY//I1yB/zZqjP9Kcoz/W3qQ/2uBlf9cbHz/LDZA/x8mMv9ndIT/eY6d/2yImf9Ye5P/SHKR/zZo" +
  "jf8rYov/JmCK/yhgiP86bI7/THWS/158k/9qgZb/boOX/22Dl/9shJb/ZYKU/1yBkv9ZgpP/WoKT/1qCk/9agpP/WoKT/1mCk/9ZgpP/W4GT/2OFl/9qhJj/" +
  "aoOY/2B/lf9Qd5L/Pm+R/ythiP8oYIn/KWGJ/zBli/9CcZH/VXmR/2aAlP9xgpX/YGx7/y02QP8fJjL/anWE/4KPnf94iZn/aoCT/1t6kv9JdZP/NWiN/yNb" +
  "h/8eV4b/KWCN/zhskv9KdpT/VHyW/1p/mP9ef5b/ZICV/2qDlv9thJX/boOU/26DlP9vg5T/b4OU/26DlP9tg5X/aYOW/2GClv9cgJb/W3+W/1d+mP9LeZb/" +
  "PG6R/yxij/8fV4f/IluG/y9kiv9Fc5L/VXmS/2Z+kv9xgpT/c4GT/2Bre/8uNUH/ISYv/2tzgP+EjZr/fYeX/3OBk/9tg5j/WXuT/0lzkv86apL/KFyI/yFX" +
  "hP8nXYf/O26T/z1uj/8/bYz/RW+L/1J1jv9hfpT/bYOY/2+Clv9vgpb/b4KW/2+Clv9vgpb/boOX/2eBlv9Vd4//SHGL/0Ftiv8+bY7/Om+R/yxiif8gVYP/" +
  "JFiG/zZojv9GcpL/VXmS/2aBlv9xgpT/dIGS/3SBkv9gann/LjQ+/w4QFv8cISr/Y2t5/3J9jf90gZL/cYKU/2p/k/9kfpb/WnuX/0lxkv88ao//MmOK/ypa" +
  "hf8qWoT/L1+G/zhniv9Db43/SXKN/05zjf9Qc4z/UHOL/1Bzi/9Qc4v/T3OL/05zjP9MdI7/RXCM/ztqif8yYYf/KVqD/yhbhP8wYor/OWiN/0Vvkf9XeZb/" +
  "Y36X/2p/lf9wgZT/dIGT/296jP9gann/Iys3/w0QF/8QEBP/DA4U/yYrN/9MVWP/ZnGA/2Vygf9mc4P/Y3SF/11zh/9Sb4b/SGqF/z5jg/8zWH7/Mlh//zVd" +
  "gP89ZIP/QmmE/0Rpgv9FaIH/RWiA/0VogP9FaH//RWh//0VpgP9FaYD/RGmC/0Jpg/89ZIL/OF+B/zJZfv8yWX7/O2GD/0drhv9ObYT/W3KH/2Jzhv9kcoT/" +
  "ZnGC/2dxgv9XYHD/KC87/w4THP8MDBH/Hx0h/xYVGv8AAgn/JCky/0NMWP9CTFr/QUxa/0FMW/8/TVz/Pk1e/zxOX/87TmH/O05j/ztOY/87TmL/O05h/ztO" +
  "YP88Tl//PE5f/zxOX/88Tl7/PE5e/zxOXv88Tl7/PE5f/zxOX/87Tl//O05g/ztOYv87TmP/O05j/ztOYv88TmD/PU5e/z9NXP9ATFv/QUxb/0JMWv9DTFn/" +
  "MTdD/wEFDP8ODxT/IB0i/w==";

let cache: Record<GameIconId, StoredTemplate> | null = null;
export function gameIcon(id: GameIconId): StoredTemplate {
  cache ??= { janus: decode(45, 46, JANUS), fountain: decode(43, 43, FOUNTAIN) };
  return cache[id];
}
