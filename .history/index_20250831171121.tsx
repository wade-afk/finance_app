import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';

// Google AdSense 타입 선언
declare global {
    interface Window {
        adsbygoogle: any[];
    }
}

interface CalculationResult {
    summary: {
        finalAmount: number;
        totalPrincipal: number;
        totalInterest: number;
    };
    breakdown: {
        year: number;
        principal: number; // For basic, this is start of year balance. For recurring, it's start balance + deposits.
        interest: number;
        finalAmount: number;
    }[];
}

interface HowToBuildResult {
    projectedAssets: number;
    targetFund: number;
    surplus: number; // positive if surplus, negative if shortfall
    growthFromPrincipal: number;
    growthFromContributions: number;
    totalContributions: number;
    requiredMonthlyContribution?: number; // only if shortfall
    requiredReturnRate?: number; // only if shortfall
}


const formatCurrency = (value: number, withSymbol: boolean = false) => {
    const formatted = Math.round(value).toLocaleString('ko-KR');
    return withSymbol ? `₩${formatted}` : formatted;
};

const numberToKorean = (number: string | number): string => {
    const num = Number(String(number).replace(/,/g, ''));
    if (isNaN(num) || num === 0) return '';

    const units = ['', '만', '억', '조', '경'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const placeValues = ['', '십', '백', '천'];

    let result: string[] = [];
    let tempNum = num;
    let unitIndex = 0;

    while (tempNum > 0) {
        const chunk = tempNum % 10000;
        if (chunk > 0) {
            let chunkStr = '';
            const sChunk = String(chunk);
            for (let i = 0; i < sChunk.length; i++) {
                const digit = Number(sChunk[sChunk.length - 1 - i]);
                if (digit > 0) {
                    chunkStr = digits[digit] + placeValues[i] + chunkStr;
                }
            }
            chunkStr = chunkStr.replace(/일([십백천])/g, '$1');
            result.unshift(chunkStr + units[unitIndex]);
        }
        tempNum = Math.floor(tempNum / 10000);
        unitIndex++;
    }

    return result.join(' ');
};

const formatWithCommas = (value: string): string => {
    if (!value) return '';
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const App = () => {
    const [activeTab, setActiveTab] = useState('basicCompound');

    // Basic compound calculator states
    const [initialPrincipal_basic, setInitialPrincipal_basic] = useState('10000000');
    const [period_basic, setPeriod_basic] = useState('10');
    const [periodUnit_basic, setPeriodUnit_basic] = useState<'years' | 'months'>('years');
    const [rate_basic, setRate_basic] = useState('7');
    const [compoundingFrequency, setCompoundingFrequency] = useState(1); // 1: Annually, 2: Semi-annually, 4: Quarterly, 12: Monthly, 365: Daily
    const [basicCompoundResult, setBasicCompoundResult] = useState<CalculationResult | null>(null);
    const [isBasicCompoundLoading, setIsBasicCompoundLoading] = useState(false);

    // Recurring compound calculator states
    const [initialPrincipal, setInitialPrincipal] = useState('10000000');
    const [monthlyDeposit, setMonthlyDeposit] = useState('1000000');
    const [period, setPeriod] = useState('40');
    const [periodUnit, setPeriodUnit] = useState<'years' | 'months'>('years');
    const [rate, setRate] = useState('12');
    const [rateUnit, setRateUnit] = useState<'annual' | 'monthly'>('annual');
    const [compoundResult, setCompoundResult] = useState<CalculationResult | null>(null);
    const [isCompoundLoading, setIsCompoundLoading] = useState(false);
    const resultRef = useRef<HTMLDivElement>(null);

    // Retirement calculator states
    const [currentAge, setCurrentAge] = useState('30');
    const [retirementAge, setRetirementAge] = useState('65');
    const [monthlyExpenses, setMonthlyExpenses] = useState('4000000');
    const [inflationRate, setInflationRate] = useState('2.5');
    const [returnRate, setReturnRate] = useState('7');
    const [retirementResult, setRetirementResult] = useState<number | null>(null);
    const [isRetirementLoading, setIsRetirementLoading] = useState(false);
    const [retirementError, setRetirementError] = useState<string | null>(null);

    // "How to Build" calculator states
    const [targetFund, setTargetFund] = useState('');
    const [currentAssets, setCurrentAssets] = useState('50000000');
    const [yearsToRetirement_build, setYearsToRetirement_build] = useState('');
    const [returnRate_build, setReturnRate_build] = useState('8');
    const [monthlyContribution_build, setMonthlyContribution_build] = useState('500000');
    const [howToBuildResult, setHowToBuildResult] = useState<HowToBuildResult | null>(null);
    const [isHowToBuildLoading, setIsHowToBuildLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'howToBuild') {
            if (retirementResult) {
                setTargetFund(Math.round(retirementResult).toString());
            }
            const numCurrentAge = parseInt(currentAge);
            const numRetirementAge = parseInt(retirementAge);
            if (!isNaN(numCurrentAge) && !isNaN(numRetirementAge) && numRetirementAge > numCurrentAge) {
                setYearsToRetirement_build((numRetirementAge - numCurrentAge).toString());
            }
        }
    }, [activeTab, retirementResult, currentAge, retirementAge]);


    const handleCurrencyChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(value) && value.length <= 16) {
            setter(value);
        }
    };

     const handleBasicCompoundCalculate = (e: React.FormEvent) => {
        e.preventDefault();
        setIsBasicCompoundLoading(true);
        setBasicCompoundResult(null);

        setTimeout(() => {
            const P0 = parseFloat(initialPrincipal_basic) || 0;
            const periodValue = parseInt(period_basic) || 0;
            const rateValue = parseFloat(rate_basic) || 0;
            const n = compoundingFrequency;

            const totalMonths = periodUnit_basic === 'years' ? periodValue * 12 : periodValue;
            const totalYears = Math.ceil(totalMonths / 12);
            const annualRate = rateValue / 100;

            const breakdown: CalculationResult['breakdown'] = [];
            let currentAmount = P0;

            for (let y = 1; y <= totalYears; y++) {
                const principalAtYearStart = currentAmount;
                const amountAtYearEnd = principalAtYearStart * Math.pow(1 + annualRate / n, n);
                const interestThisYear = amountAtYearEnd - principalAtYearStart;
                currentAmount = amountAtYearEnd;

                breakdown.push({
                    year: y,
                    principal: principalAtYearStart,
                    interest: interestThisYear,
                    finalAmount: currentAmount,
                });
            }

            const finalAmount = P0 * Math.pow(1 + annualRate / n, n * (totalMonths / 12));
            const totalInterest = finalAmount - P0;

            setBasicCompoundResult({
                summary: {
                    finalAmount: finalAmount,
                    totalPrincipal: P0,
                    totalInterest,
                },
                breakdown,
            });
            setIsBasicCompoundLoading(false);
        }, 50);
    };

    const handleCompoundCalculate = (e: React.FormEvent) => {
        e.preventDefault();
        setIsCompoundLoading(true);
        setCompoundResult(null);

        setTimeout(() => {
            const P0 = parseFloat(initialPrincipal) || 0;
            const d = parseFloat(monthlyDeposit) || 0;
            const periodValue = parseInt(period) || 0;
            const rateValue = parseFloat(rate) || 0;

            const totalMonths = periodUnit === 'years' ? periodValue * 12 : periodValue;
            const totalYears = Math.ceil(totalMonths / 12);
            const annualRate = rateUnit === 'annual' ? rateValue / 100 : (rateValue / 100) * 12;

            const breakdown: CalculationResult['breakdown'] = [];
            let currentAmount = P0;
            
            for (let y = 1; y <= totalYears; y++) {
                const principalAtYearStart = currentAmount;
                const monthsInThisYear = (y * 12 > totalMonths) ? totalMonths % 12 : 12;
                if (monthsInThisYear === 0 && totalMonths > 0) continue;

                const depositsThisYear = d * monthsInThisYear;
                
                let interestThisYear = 0;
                let tempAmount = currentAmount;
                for(let m = 0; m < monthsInThisYear; m++){
                    tempAmount += d;
                    interestThisYear += tempAmount * (annualRate/12);
                    tempAmount += tempAmount * (annualRate/12);
                }
                
                const finalAmountThisYear = principalAtYearStart + depositsThisYear + interestThisYear;
                 currentAmount = finalAmountThisYear;

                breakdown.push({
                    year: y,
                    principal: principalAtYearStart + depositsThisYear,
                    interest: interestThisYear,
                    finalAmount: finalAmountThisYear,
                });
            }
            
            const finalTotalPrincipal = P0 + (d * totalMonths);
            const totalInterest = currentAmount - finalTotalPrincipal;
            
            setCompoundResult({
                summary: {
                    finalAmount: currentAmount,
                    totalPrincipal: finalTotalPrincipal,
                    totalInterest,
                },
                breakdown,
            });
            setIsCompoundLoading(false);
        }, 50);
    };

    const handleRetirementCalculate = (e: React.FormEvent) => {
        e.preventDefault();
        setIsRetirementLoading(true);
        setRetirementResult(null);
        setRetirementError(null);

        setTimeout(() => {
            const numCurrentAge = parseInt(currentAge);
            const numRetirementAge = parseInt(retirementAge);
            const numMonthlyExpenses = parseFloat(monthlyExpenses.replace(/,/g, '')) || 0;
            const numAnnualExpenses = numMonthlyExpenses * 12;
            const numInflationRate = parseFloat(inflationRate) / 100;
            const numReturnRate = parseFloat(returnRate) / 100;

            if (numRetirementAge <= numCurrentAge) {
                setRetirementError('은퇴 예상 나이는 현재 나이보다 많아야 합니다.');
                setIsRetirementLoading(false);
                return;
            }

            if (numReturnRate <= numInflationRate) {
                setRetirementError('기대 수익률은 물가상승률보다 높아야 합니다. 그렇지 않으면 자산 가치가 감소합니다.');
                setIsRetirementLoading(false);
                return;
            }

            const yearsToRetirement = numRetirementAge - numCurrentAge;
            const futureAnnualExpenses = numAnnualExpenses * Math.pow(1 + numInflationRate, yearsToRetirement);
            const realReturnRate = numReturnRate - numInflationRate;
            const requiredFund = futureAnnualExpenses / realReturnRate;
            
            setRetirementResult(requiredFund);
            setIsRetirementLoading(false);
        }, 50);
    };
    
    const handleHowToBuildCalculate = (e: React.FormEvent) => {
        e.preventDefault();
        setIsHowToBuildLoading(true);
        setHowToBuildResult(null);

        setTimeout(() => {
            const numTarget = parseFloat(targetFund.replace(/,/g, '')) || 0;
            const numCurrent = parseFloat(currentAssets.replace(/,/g, '')) || 0;
            const numYears = parseInt(yearsToRetirement_build) || 0;
            const numRate = parseFloat(returnRate_build) / 100;
            const numMonthly = parseFloat(monthlyContribution_build.replace(/,/g, '')) || 0;
            
            // FV of current assets
            const fvCurrent = numCurrent * Math.pow(1 + numRate, numYears);
            
            // FV of monthly contributions
            const monthlyRate = numRate / 12;
            const totalMonths = numYears * 12;
            const fvMonthly = totalMonths > 0 ? numMonthly * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) : 0;
            
            const projectedAssets = fvCurrent + fvMonthly;
            const surplus = projectedAssets - numTarget;

            const growthFromPrincipal = fvCurrent - numCurrent;
            const totalContributions = numMonthly * totalMonths;
            const growthFromContributions = fvMonthly - totalContributions;

            let result: HowToBuildResult = {
                projectedAssets,
                targetFund: numTarget,
                surplus,
                growthFromPrincipal,
                growthFromContributions,
                totalContributions,
            };

            if (surplus < 0) {
                const requiredFvFromContributions = numTarget - fvCurrent;
                if (requiredFvFromContributions > 0 && totalMonths > 0) {
                     const requiredMonthly = requiredFvFromContributions * (monthlyRate / (Math.pow(1 + monthlyRate, totalMonths) - 1));
                     result.requiredMonthlyContribution = requiredMonthly;
                }

                // Binary search for the required rate
                if (numTarget > numCurrent) {
                    let low = 0;
                    let high = 1; // 100% as a reasonable upper bound
                    for (let i = 0; i < 100; i++) { // 100 iterations for precision
                        const mid = (low + high) / 2;
                        if (mid <= 0) {
                           low = 1e-9;
                           continue;
                        }
                        const fvCurrent_b = numCurrent * Math.pow(1 + mid, numYears);
                        const monthlyRate_b = mid / 12;
                        const fvMonthly_b = totalMonths > 0 ? numMonthly * ((Math.pow(1 + monthlyRate_b, totalMonths) - 1) / monthlyRate_b) : 0;
                        const projected_b = fvCurrent_b + fvMonthly_b;
                        
                        if (projected_b < numTarget) {
                            low = mid;
                        } else {
                            high = mid;
                        }
                    }
                    if (high < 1) {
                        result.requiredReturnRate = high * 100;
                    }
                }
            }
            
            setHowToBuildResult(result);
            setIsHowToBuildLoading(false);
        }, 50);
    };

    const handleDownload = async () => {
        if (!resultRef.current) return;
        
        const canvas = await html2canvas(resultRef.current, {
            useCORS: true,
            scale: 2,
            backgroundColor: '#ffffff'
        });
        const link = document.createElement('a');
        link.download = 'financial-calculation-result.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    // 광고 로드 함수
    const loadAds = () => {
        // PC 버전 사이드바 광고
        const desktopAdContainer = document.getElementById('desktop-ad');
        if (desktopAdContainer && window.innerWidth >= 769) {
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9588119791313794';
            script.crossOrigin = 'anonymous';
            document.head.appendChild(script);
            
            script.onload = () => {
                const adElement = document.createElement('ins');
                adElement.className = 'adsbygoogle';
                adElement.style.display = 'block';
                adElement.setAttribute('data-ad-client', 'ca-pub-9588119791313794');
                adElement.setAttribute('data-ad-slot', '2352948514');
                adElement.setAttribute('data-ad-format', 'auto');
                adElement.setAttribute('data-full-width-responsive', 'true');
                
                desktopAdContainer.appendChild(adElement);
                
                if (window.adsbygoogle) {
                    window.adsbygoogle.push({});
                }
            };
        }

        // 모바일 광고
        const mobileAdContainer = document.getElementById('mobile-ad');
        if (mobileAdContainer && window.innerWidth <= 768) {
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9588119791313794';
            script.crossOrigin = 'anonymous';
            document.head.appendChild(script);
            
            script.onload = () => {
                const adElement = document.createElement('ins');
                adElement.className = 'adsbygoogle';
                adElement.style.display = 'block';
                adElement.setAttribute('data-ad-client', 'ca-pub-9588119791313794');
                adElement.setAttribute('data-ad-slot', '3666030186');
                adElement.setAttribute('data-ad-format', 'auto');
                adElement.setAttribute('data-full-width-responsive', 'true');
                
                mobileAdContainer.appendChild(adElement);
                
                if (window.adsbygoogle) {
                    window.adsbygoogle.push({});
                }
            };
        }
    };

    useEffect(() => {
        loadAds();
    }, []);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', maxWidth: '1200px', margin: '0 auto', alignItems: 'flex-start' }}>
            {/* 메인 콘텐츠 (왼쪽) */}
            <div className="main-content">
                <div className="calculator-app">
                    <h1>은퇴 계산기</h1>
                    
                    {/* 모바일 광고 (제목 아래) */}
                    <div className="ad-container mobile">
                        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9588119791313794"
                             crossorigin="anonymous"></script>
                        {/* bdmt_Header/footerAd_수평 */}
                        <ins className="adsbygoogle"
                             style={{display: 'block'}}
                             data-ad-client="ca-pub-9588119791313794"
                             data-ad-slot="3666030186"
                             data-ad-format="auto"
                             data-full-width-responsive="true"></ins>
                        <script>
                             (adsbygoogle = window.adsbygoogle || []).push({});
                        </script>
                    </div>

            <div className="tabs">
                <button 
                    className={`tab-button ${activeTab === 'basicCompound' ? 'active' : ''}`}
                    onClick={() => setActiveTab('basicCompound')}
                >
                    기본<br/>복리계산기
                </button>
                <button 
                    className={`tab-button ${activeTab === 'compound' ? 'active' : ''}`}
                    onClick={() => setActiveTab('compound')}
                >
                    적립식<br/>복리계산기
                </button>
                <button 
                    className={`tab-button ${activeTab === 'retirement' ? 'active' : ''}`}
                    onClick={() => setActiveTab('retirement')}
                >
                    은퇴자금<br/>계산기
                </button>
                 <button 
                    className={`tab-button ${activeTab === 'howToBuild' ? 'active' : ''}`}
                    onClick={() => setActiveTab('howToBuild')}
                >
                    은퇴자금<br/>만들기
                </button>
            </div>

            {activeTab === 'basicCompound' && (
                <>
                    <form onSubmit={handleBasicCompoundCalculate}>
                        <div className="form-group">
                            <label htmlFor="initial-principal-basic">시작 금액 (₩)</label>
                            <div className="currency-input-wrapper">
                                <input id="initial-principal-basic" type="text" inputMode="numeric" value={formatWithCommas(initialPrincipal_basic)} onChange={handleCurrencyChange(setInitialPrincipal_basic)} required />
                                <span className="korean-currency-display">{initialPrincipal_basic ? `${numberToKorean(initialPrincipal_basic)} 원` : ''}</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>투자 기간</label>
                            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                <input id="period-basic" type="number" value={period_basic} onChange={(e) => setPeriod_basic(e.target.value)} required style={{flex: 1}}/>
                                <div className="radio-group">
                                    <label><input type="radio" name="periodUnitBasic" value="years" checked={periodUnit_basic === 'years'} onChange={() => setPeriodUnit_basic('years')} /> 년</label>
                                    <label><input type="radio" name="periodUnitBasic" value="months" checked={periodUnit_basic === 'months'} onChange={() => setPeriodUnit_basic('months')} /> 개월</label>
                                </div>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="rate-basic">연이율 (%)</label>
                            <div className="input-group-with-unit">
                                <input id="rate-basic" type="number" value={rate_basic} onChange={(e) => setRate_basic(e.target.value)} required step="0.1" placeholder="예: 7" />
                                <span className="input-unit">%</span>
                            </div>
                        </div>
                         <div className="form-group">
                            <label htmlFor="compounding-frequency">복리 계산 주기</label>
                            <select id="compounding-frequency" value={compoundingFrequency} onChange={e => setCompoundingFrequency(Number(e.target.value))}>
                                <option value="1">매년</option>
                                <option value="2">반년마다</option>
                                <option value="4">분기마다</option>
                                <option value="12">매월</option>
                                <option value="365">매일</option>
                            </select>
                        </div>
                        <button type="submit" className="calculate-btn" disabled={isBasicCompoundLoading}>
                            {isBasicCompoundLoading ? <div className="loading-spinner"></div> : '계산하기'}
                        </button>
                    </form>

                     {basicCompoundResult && (
                        <>
                            <div className="result-container" ref={resultRef}>
                                <div className="result-summary">
                                    <div className="summary-card">
                                        <span className="label">총 수익</span>
                                        <span className="value profit">{formatCurrency(basicCompoundResult.summary.totalInterest, true)}</span>
                                    </div>
                                    <div className="summary-card">
                                        <span className="label">총 투자금</span>
                                        <span className="value">{formatCurrency(basicCompoundResult.summary.totalPrincipal, true)}</span>
                                    </div>
                                    <div className="summary-card">
                                        <span className="label">최종 금액</span>
                                        <span className="value final-amount">{formatCurrency(basicCompoundResult.summary.finalAmount, true)}</span>
                                    </div>
                                </div>
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>년</th>
                                                <th>기초금액 (₩)</th>
                                                <th>수익 (₩)</th>
                                                <th>기말금액 (₩)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {basicCompoundResult.breakdown.map((row) => (
                                                <tr key={row.year} className={(row.year % 5 === 0) ? 'highlight' : ''}>
                                                    <td>{row.year}</td>
                                                    <td>{formatCurrency(row.principal)}</td>
                                                    <td className="profit-cell">+{formatCurrency(row.interest)}</td>
                                                    <td className="final-amount-cell">{formatCurrency(row.finalAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <button onClick={handleDownload} className="calculate-btn download-button">
                                결과 이미지 다운로드
                            </button>
                        </>
                    )}
                </>
            )}

            {activeTab === 'compound' && (
                <>
                    <form onSubmit={handleCompoundCalculate}>
                        <div className="form-group">
                            <label htmlFor="initial-principal">시작 금액 (₩)</label>
                            <div className="currency-input-wrapper">
                                <input id="initial-principal" type="text" inputMode="numeric" value={formatWithCommas(initialPrincipal)} onChange={handleCurrencyChange(setInitialPrincipal)} required />
                                <span className="korean-currency-display">{initialPrincipal ? `${numberToKorean(initialPrincipal)} 원` : ''}</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="monthly-deposit">매월 적립 금액 (₩)</label>
                            <div className="currency-input-wrapper">
                                <input id="monthly-deposit" type="text" inputMode="numeric" value={formatWithCommas(monthlyDeposit)} onChange={handleCurrencyChange(setMonthlyDeposit)} required />
                                <span className="korean-currency-display">{monthlyDeposit ? `${numberToKorean(monthlyDeposit)} 원` : ''}</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>투자 기간</label>
                            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                <input id="period" type="number" value={period} onChange={(e) => setPeriod(e.target.value)} required style={{flex: 1}}/>
                                <div className="radio-group">
                                    <label><input type="radio" name="periodUnit" value="years" checked={periodUnit === 'years'} onChange={() => setPeriodUnit('years')} /> 년</label>
                                    <label><input type="radio" name="periodUnit" value="months" checked={periodUnit === 'months'} onChange={() => setPeriodUnit('months')} /> 개월</label>
                                </div>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>이자율</label>
                            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                                <input id="rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} required step="0.1" style={{flex: 1}} placeholder="예: 12" />
                                <div className="radio-group">
                                    <label><input type="radio" name="rateUnit" value="annual" checked={rateUnit === 'annual'} onChange={() => setRateUnit('annual')} /> 년</label>
                                    <label><input type="radio" name="rateUnit" value="monthly" checked={rateUnit === 'monthly'} onChange={() => setRateUnit('monthly')} /> 월</label>
                                </div>
                            </div>
                        </div>
                        <button type="submit" className="calculate-btn" disabled={isCompoundLoading}>
                            {isCompoundLoading ? <div className="loading-spinner"></div> : '계산하기'}
                        </button>
                    </form>

                    {compoundResult && (
                        <>
                            <div className="result-container" ref={resultRef}>
                                <div className="result-summary">
                                    <div className="summary-card">
                                        <span className="label">총 수익</span>
                                        <span className="value profit">{formatCurrency(compoundResult.summary.totalInterest, true)}</span>
                                    </div>
                                    <div className="summary-card">
                                        <span className="label">총 투자금</span>
                                        <span className="value">{formatCurrency(compoundResult.summary.totalPrincipal, true)}</span>
                                    </div>
                                    <div className="summary-card">
                                        <span className="label">최종 금액</span>
                                        <span className="value final-amount">{formatCurrency(compoundResult.summary.finalAmount, true)}</span>
                                    </div>
                                </div>
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>년</th>
                                                <th>원금 (₩)</th>
                                                <th>수익 (₩)</th>
                                                <th>최종 금액 (₩)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {compoundResult.breakdown.map((row) => (
                                                <tr key={row.year} className={(row.year % 5 === 0) ? 'highlight' : ''}>
                                                    <td>{row.year}</td>
                                                    <td>{formatCurrency(row.principal)}</td>
                                                    <td className="profit-cell">+{formatCurrency(row.interest)}</td>
                                                    <td className="final-amount-cell">{formatCurrency(row.finalAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <button onClick={handleDownload} className="calculate-btn download-button">
                                결과 이미지 다운로드
                            </button>
                        </>
                    )}
                </>
            )}

            {activeTab === 'retirement' && (
                <>
                    <form onSubmit={handleRetirementCalculate}>
                         <div className="form-group">
                            <label htmlFor="current-age">현재 나이</label>
                            <div className="input-group-with-unit">
                                <input id="current-age" type="number" value={currentAge} onChange={e => setCurrentAge(e.target.value)} required />
                                <span className="input-unit">세</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="retirement-age">은퇴 예상 나이</label>
                            <div className="input-group-with-unit">
                                <input id="retirement-age" type="number" value={retirementAge} onChange={e => setRetirementAge(e.target.value)} required />
                                <span className="input-unit">세</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="monthly-expenses">은퇴 후 월간 필요 지출액 (₩)</label>
                            <div className="currency-input-wrapper">
                                <input id="monthly-expenses" type="text" inputMode="numeric" value={formatWithCommas(monthlyExpenses)} onChange={handleCurrencyChange(setMonthlyExpenses)} required />
                                <span className="korean-currency-display">{monthlyExpenses ? `${numberToKorean(monthlyExpenses)} 원` : ''}</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="inflation-rate">예상 물가상승률</label>
                             <div className="input-group-with-unit">
                                <input id="inflation-rate" type="number" step="0.1" value={inflationRate} onChange={e => setInflationRate(e.target.value)} required />
                                <span className="input-unit">%</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="return-rate">은퇴 후 기대 연복리 수익률</label>
                            <div className="input-group-with-unit">
                                <input id="return-rate" type="number" step="0.1" value={returnRate} onChange={e => setReturnRate(e.target.value)} required />
                                <span className="input-unit">%</span>
                            </div>
                        </div>
                        <button type="submit" className="calculate-btn" disabled={isRetirementLoading}>
                            {isRetirementLoading ? <div className="loading-spinner"></div> : '필요 은퇴자금 계산'}
                        </button>
                    </form>
                    
                    {retirementError && <div className="error-message">{retirementError}</div>}

                    {retirementResult !== null && (
                        <div className="result-card">
                            <h2>필요 은퇴자금</h2>
                            <p className="result-description">{retirementAge}세에 은퇴하기 위해 필요한 총 자금입니다.</p>
                            <p className="result-value">{formatCurrency(retirementResult, true)}</p>
                            <p className="result-description">이 금액은 은퇴 시점의 화폐 가치 기준입니다. (물가상승률 반영)</p>
                        </div>
                    )}
                    
                    <div className="explanation-section">
                        <h3>사용방법</h3>
                        <ol>
                            <li>현재 나이와 은퇴를 희망하는 나이를 입력합니다.</li>
                            <li>은퇴 후 예상되는 월간 지출액을 현재 가치로 입력합니다.</li>
                            <li>앞으로의 연평균 물가상승률을 예상하여 입력합니다.</li>
                            <li>은퇴 자금을 운용할 때 기대되는 연평균 수익률을 입력합니다.</li>
                            <li>'필요 은퇴자금 계산' 버튼을 클릭하여 결과를 확인합니다.</li>
                        </ol>

                        <h3>계산 공식</h3>
                        <div className="explanation-formula">
                            <div className="fraction">
                                <span className="numerator">은퇴 시점의 연간 필요 지출액</span>
                                <span className="denominator">은퇴 후 기대 연복리 수익률 − 예상 물가상승률</span>
                            </div>
                        </div>
                        <p style={{textAlign: 'center', marginTop: '10px', fontSize: '14px', color: '#555'}}>
                            * 은퇴 시점의 연간 필요 지출액 = 현재 월간 필요 지출액 × 12 × (1 + 예상 물가상승률)<sup>은퇴까지 남은 기간</sup>
                        </p>

                        <h3>변수 설명</h3>
                        <ul className="explanation-variables">
                            <li><strong>은퇴 시점의 연간 필요 지출액:</strong> 은퇴하는 시점에 물가상승을 반영하여 계산된 1년 생활비입니다.</li>
                            <li><strong>은퇴 후 기대 연복리 수익률:</strong> 은퇴 자산을 인출하면서 동시에 투자할 때 기대되는 연평균 수익률입니다.</li>
                            <li><strong>예상 물가상승률:</strong> 화폐 가치가 하락하는 정도를 나타내며, 일반적으로 연 2-3%로 가정합니다.</li>
                        </ul>
                        <hr />
                        <h4>투자를 시작하기 전 확인해야 할 것들</h4>
                        <p>당신과 부양가족이 1년 정도 무난히 생활할 수 있는 금액을 파악하는 것부터 시작해, 은퇴 후 필요한 자금을 계산해 보는 것이 중요합니다. 은퇴 후에는 모아둔 자산으로만 생활해야 하기 때문입니다. 많은 사람들이 은퇴에 필요한 자금이 얼마인지 정확히 알지 못합니다. 성공적인 투자를 위해서는 이 금액을 파악하는 것이 기본입니다.</p>
                        <p>투자를 시작하기 전 다음 3가지 질문에 답할 수 있어야 합니다.</p>
                        <ol>
                            <li>은퇴할 때 얼마의 자금이 필요한가?</li>
                            <li>목표를 달성하기 위해 매월 얼마를 투자해야 하는가?</li>
                            <li>어느 정도의 투자 수익률을 기대할 수 있는가?</li>
                        </ol>

                        <h4>예시: 30세 철수의 은퇴 계획</h4>
                        <p>현재 30세인 철수는 50세에 은퇴하여 자본 수익만으로 생활하는 꿈이 있습니다. 50세부터 월 300만 원이 필요하고, 예상 물가상승률은 연 3%, 은퇴 후 투자 수익률(CAGR)은 연 8%라고 가정해 봅시다.</p>
                        
                        <p><strong>잘못된 계산 1: 물가상승률을 고려하지 않은 경우</strong><br/>
                        단순히 <code>300만 원 × 12개월 / 8% = 4억 5천만 원</code>으로 계산하면 될까요? <br/>
                        아닙니다. 이 금액은 첫 해에는 월 300만 원을 만들어 줄 수 있지만, 물가상승으로 인해 시간이 지날수록 돈의 가치가 떨어져 동일한 생활 수준을 유지할 수 없습니다.</p>
                        
                        <p><strong>잘못된 계산 2: 은퇴 시점의 화폐가치를 고려하지 않은 경우</strong><br/>
                        그렇다면 실질수익률(수익률 - 물가상승률)을 적용한 <code>300만 원 × 12개월 / (8% - 3%) = 7억 2천만 원</code>은 어떨까요?<br/>
                        이 또한 정답이 아닙니다. 이 계산은 '현재' 필요한 월 300만 원을 기준으로 했기 때문입니다. 철수가 은퇴하는 20년 후에는 화폐 가치가 달라집니다.</p>

                        <p><strong>올바른 계산</strong><br/>
                        먼저 20년 후 월 300만 원의 미래가치를 계산해야 합니다.<br/>
                        <code>300만 원 × (1 + 3%)<sup>20년</sup> = 약 542만 원</code><br/>
                        즉, 20년 후에는 월 542만 원이 현재의 300만 원과 동일한 구매력을 가집니다.<br/>
                        이제 이 금액을 바탕으로 필요한 은퇴 자금을 계산합니다.<br/>
                        <code>(542만 원 × 12개월) / (8% - 3%) = <strong>약 13억 원</strong></code></p>
                        
                        <p style={{marginTop: '20px'}}>따라서 당신이 은퇴할 때 필요한 자금은 아래 공식으로 계산할 수 있습니다.</p>
                        <div className="explanation-formula">
                            <div style={{textAlign: 'center', lineHeight: 1.2}}>
                                <strong>은퇴자금 = </strong>
                                <div className="fraction" style={{verticalAlign: 'middle', marginLeft: '5px'}}>
                                    <span className="numerator">(현재 연간 필요 지출액 × (1 + 예상물가상승률)<sup>은퇴까지 남은 년수</sup>)</span>
                                    <span className="denominator">(연복리 수익률 - 예상물가상승률)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'howToBuild' && (
                 <>
                    <form onSubmit={handleHowToBuildCalculate}>
                        <div className="form-group">
                            <label htmlFor="target-fund">목표 은퇴 자금 (₩)</label>
                             <div className="currency-input-wrapper">
                                <input id="target-fund" type="text" inputMode="numeric" value={formatWithCommas(targetFund)} onChange={handleCurrencyChange(setTargetFund)} required />
                                <span className="korean-currency-display">{targetFund ? `${numberToKorean(targetFund)} 원` : ''}</span>
                            </div>
                        </div>
                         <div className="form-group">
                            <label htmlFor="current-assets">현재 보유 자산 (₩)</label>
                            <div className="currency-input-wrapper">
                                <input id="current-assets" type="text" inputMode="numeric" value={formatWithCommas(currentAssets)} onChange={handleCurrencyChange(setCurrentAssets)} required />
                                <span className="korean-currency-display">{currentAssets ? `${numberToKorean(currentAssets)} 원` : ''}</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="years-to-retirement">은퇴까지 남은 기간</label>
                             <div className="input-group-with-unit">
                                <input id="years-to-retirement" type="number" value={yearsToRetirement_build} onChange={e => setYearsToRetirement_build(e.target.value)} required />
                                <span className="input-unit">년</span>
                            </div>
                        </div>
                         <div className="form-group">
                            <label htmlFor="return-rate-build">예상 연복리 수익률</label>
                             <div className="input-group-with-unit">
                                <input id="return-rate-build" type="number" step="0.1" value={returnRate_build} onChange={e => setReturnRate_build(e.target.value)} required />
                                <span className="input-unit">%</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="monthly-contribution">매월 추가 적립액 (₩)</label>
                             <div className="currency-input-wrapper">
                                <input id="monthly-contribution" type="text" inputMode="numeric" value={formatWithCommas(monthlyContribution_build)} onChange={handleCurrencyChange(setMonthlyContribution_build)} required />
                                <span className="korean-currency-display">{monthlyContribution_build ? `${numberToKorean(monthlyContribution_build)} 원` : ''}</span>
                            </div>
                        </div>
                        <button type="submit" className="calculate-btn" disabled={isHowToBuildLoading}>
                            {isHowToBuildLoading ? <div className="loading-spinner"></div> : '결과 확인하기'}
                        </button>
                    </form>

                     {howToBuildResult && (
                        <div className="result-container">
                            <div className="result-summary">
                                <div className="summary-card">
                                    <span className="label">예상 은퇴 시점 자산</span>
                                    <span className="value final-amount">{formatCurrency(howToBuildResult.projectedAssets, true)}</span>
                                </div>
                                <div className="summary-card">
                                    <span className="label">총 추가 적립액</span>
                                    <span className="value">{formatCurrency(howToBuildResult.totalContributions, true)}</span>
                                </div>
                                <div className="summary-card">
                                    <span className="label">총 수익</span>
                                    <span className="value profit">{formatCurrency(howToBuildResult.growthFromPrincipal + howToBuildResult.growthFromContributions, true)}</span>
                                </div>
                            </div>
                            
                            {howToBuildResult.surplus >= 0 ? (
                                <div className="result-message success">
                                    <strong>목표 달성!</strong>
                                    <div className="advice">
                                        예상 은퇴 시점 자산이 목표 금액보다 <strong>{formatCurrency(howToBuildResult.surplus, true)}</strong> 많습니다.
                                    </div>
                                </div>
                            ) : (
                                <div className="result-message shortfall">
                                    <strong>목표까지 부족해요.</strong>
                                    <div className="advice">
                                        목표를 달성하려면 <strong>{formatCurrency(Math.abs(howToBuildResult.surplus), true)}</strong>이 부족합니다.
                                        {howToBuildResult.requiredMonthlyContribution && (
                                            <>
                                                <br/>매월 <strong>{formatCurrency(howToBuildResult.requiredMonthlyContribution, true)}</strong>을 적립해야 목표를 달성할 수 있습니다.
                                            </>
                                        )}
                                        {howToBuildResult.requiredReturnRate && (
                                            <>
                                                <br/>또는, 현재 적립액을 유지하면서 연복리 <strong>{howToBuildResult.requiredReturnRate.toFixed(2)}%</strong>의 수익률을 달성해야 합니다.
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="explanation-section">
                        <h3>사용방법</h3>
                        <ol>
                            <li>'은퇴자금 계산기'에서 계산된 목표 금액이 자동으로 입력됩니다. 직접 수정할 수도 있습니다.</li>
                            <li>현재까지 모은 자산(예/적금, 주식, 부동산 등)의 총액을 입력합니다.</li>
                            <li>은퇴까지 남은 기간을 년 단위로 입력합니다.</li>
                            <li>자산을 운용하며 기대하는 연평균 복리 수익률을 입력합니다.</li>
                            <li>매월 추가로 저축 또는 투자할 금액을 입력합니다.</li>
                            <li>'결과 확인하기' 버튼을 클릭하여 은퇴 시점의 자산을 예측합니다.</li>
                        </ol>

                        <h3>계산 공식</h3>
                        <p style={{textAlign: 'center', fontWeight: 'bold'}}>예상 은퇴 자산 = 현재 자산의 미래가치 + 월 적립액의 미래가치</p>
                        <ul className="explanation-variables" style={{marginTop: '15px'}}>
                            <li><strong>현재 자산의 미래가치:</strong> 현재 자산 × (1 + 연수익률)<sup>은퇴까지 기간</sup></li>
                            <li><strong>월 적립액의 미래가치:</strong> 월 적립액 × [ ((1 + 월수익률)<sup>총 개월수</sup> - 1) / 월수익률 ]</li>
                        </ul>

                        <h3>변수 설명</h3>
                        <ul className="explanation-variables">
                            <li><strong>목표 은퇴 자금:</strong> 은퇴 후 안정적인 생활을 위해 필요한 총 자금입니다.</li>
                            <li><strong>현재 보유 자산:</strong> 현재 시점의 순자산(총자산 - 총부채)을 의미합니다.</li>
                            <li><strong>예상 연복리 수익률:</strong> 투자를 통해 자산이 연평균 몇 %씩 성장할지에 대한 예상치입니다.</li>
                            <li><strong>매월 추가 적립액:</strong> 은퇴 자금을 마련하기 위해 매월 꾸준히 저축하거나 투자하는 금액입니다.</li>
                        </ul>
                    </div>
                 </>
            )}
                </div>
            </div>
            
            {/* PC 버전 사이드바 광고 (오른쪽) */}
            <div className="sidebar-ad">
                <div id="desktop-ad" className="ad-container desktop"></div>
            </div>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}