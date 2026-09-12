# EC-OptiSim

패러데이 법칙 및 동적 부동태화 모델링 기반 전기응집(Electrocoagulation) 공정
최적화 및 스마트 제어 웹 시뮬레이터. **Next.js(React) + JavaScript**로 작성되어
Vercel에 바로 배포할 수 있습니다.

## 핵심 기능

- **정적 최적화 엔진**: 목표 제거율을 만족하면서 [전력비 + 전극 소모비]를
  최소화하는 최적 전류밀도 J*를 경사하강법(수치 미분 기반)으로 탐색
- **동적 시뮬레이터**: 0~720시간 동안 부동태화에 의한 전압 상승,
  임계 전압 도달 시 역극성 전환(톱니파형), 전극 질량 감소 및 20% 이하
  도달 시 교체 알람을 시뮬레이션
- **실시간 파라미터 대시보드**: 유량, 전극 재질(Al/Fe), 목표 제거율,
  전기/전극 단가, 전극 면적, 부동태화 계수 등을 슬라이더로 조절

## 물리 모델에 대한 정직한 안내

- 패러데이 법칙에 따른 전극 소모량 계산(`m = IM/zF`)은 물리적으로 엄밀합니다.
- 반면 표준 기전력(V₀), 셀 내부저항(R_cell), 제거율 반응계수(k_rem) 등은
  실측 문헌값이 아니라 **그래프의 정성적 형태**(비용 증가, 제거율 포화 등)를
  재현하기 위한 교육용 예시 상수입니다. 발표/제출 시 이 점을 명시하는 것을
  권장합니다. (`lib/simulation.js` 상단 주석 참고)

## 로컬 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` 에서 확인.

## GitHub → Vercel 배포 (4단계)

1. **GitHub 리포지토리 생성**
   - GitHub에서 새 리포지토리 생성 (예: `ec-optisim`)
   - 이 폴더 전체를 업로드 (또는 `git init` → `git add .` → `git commit` →
     `git push`)
   - `node_modules`, `.next`는 `.gitignore`에 이미 포함되어 있어 올라가지
     않습니다.

2. **Vercel 가입 및 GitHub 연동**
   - [vercel.com](https://vercel.com) 접속 → GitHub 계정으로 로그인

3. **프로젝트 Import**
   - Vercel 대시보드에서 "Add New → Project"
   - 방금 만든 GitHub 리포지토리 선택
   - Framework Preset은 **Next.js**가 자동으로 인식됩니다 (별도 설정 불필요)

4. **Deploy 클릭**
   - 1~2분 내 빌드 완료 후 `https://ec-optisim-xxxx.vercel.app` 형태의
     공개 URL이 생성됩니다.
   - 이후 GitHub에 push할 때마다 자동으로 재배포됩니다.

## 기술 스택

- Next.js 15 (App Router) / React 18
- Tailwind CSS
- Recharts (인터랙티브 차트)
