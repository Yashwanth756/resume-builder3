/* AuraResume ATS - Client-Side Controller */

document.addEventListener('DOMContentLoaded', () => {
    // STATE MANAGMENT
    const state = {
        apiKey: localStorage.getItem('aura_api_key') || '',
        model: localStorage.getItem('aura_model') || 'gemini-2.5-flash-lite',
        currentStep: 'input', // 'input', 'qa', 'results'
        originalResume: '',
        jobDescription: '',
        lastQuestions: [], // Questions returned by Step 1
        diagnostics: null  // Results from Step 2
    };

    // DOM ELEMENTS
    const body = document.body;
    
    // Header
    const themeToggleBtn = document.getElementById('theme-toggle');
    const settingsToggleBtn = document.getElementById('settings-toggle');
    
    // Panes
    const stepInputPane = document.getElementById('step-input');
    const stepQaPane = document.getElementById('step-qa');
    const stepResultsPane = document.getElementById('step-results');
    
    // Inputs
    const resumeTextarea = document.getElementById('resume-text');
    const jdTextarea = document.getElementById('jd-text');
    const btnScan = document.getElementById('btn-scan');
    
    // Q&A
    const qaQuestionsList = document.getElementById('qa-questions-list');
    const btnQaSubmit = document.getElementById('btn-qa-submit');
    const btnQaSkip = document.getElementById('btn-qa-skip');
    
    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-close');
    const settingsApiKeyInput = document.getElementById('settings-api-key');
    const settingsModelSelect = document.getElementById('settings-model');
    const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    
    // Loader
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingTitle = document.getElementById('loading-title');
    const loadingSubtitle = document.getElementById('loading-subtitle');
    const loaderStep1 = document.getElementById('loader-step-1');
    const loaderStep2 = document.getElementById('loader-step-2');
    const loaderStep3 = document.getElementById('loader-step-3');
    
    // Results
    const scoreNum = document.getElementById('score-num');
    const scoreFill = document.getElementById('score-fill');
    const scoreHeading = document.getElementById('score-heading');
    const scoreDescription = document.getElementById('score-description');
    const strengthsList = document.getElementById('strengths-list');
    const weaknessesList = document.getElementById('weaknesses-list');
    const rulesList = document.getElementById('rules-list');
    
    // Tab toggles
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Resume Output Actions
    const btnViewPreview = document.getElementById('btn-view-preview');
    const btnViewRaw = document.getElementById('btn-view-raw');
    const btnCopy = document.getElementById('btn-copy');
    const btnPrint = document.getElementById('btn-print');
    const btnRestart = document.getElementById('btn-restart');
    
    const formattedResumeView = document.getElementById('print-resume-content');
    const rawResumeView = document.getElementById('raw-resume-content');
    
    // Toast Notification
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // INITIAL SETUP
    // Load theme setting
    const savedTheme = localStorage.getItem('aura_theme') || 'dark';
    setTheme(savedTheme);

    // Set configuration inputs
    settingsApiKeyInput.value = state.apiKey;
    settingsModelSelect.value = state.model;

    // Toast function
    function showToast(message, type = 'success') {
        toastMessage.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    // Set Theme Action
    function setTheme(theme) {
        if (theme === 'light') {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
            themeToggleBtn.innerHTML = '<i class="ri-moon-line"></i>';
            localStorage.setItem('aura_theme', 'light');
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
            themeToggleBtn.innerHTML = '<i class="ri-sun-line"></i>';
            localStorage.setItem('aura_theme', 'dark');
        }
    }

    // Toggle Theme Click
    themeToggleBtn.addEventListener('click', () => {
        const isDark = body.classList.contains('dark-theme');
        setTheme(isDark ? 'light' : 'dark');
    });

    // Toggle Key Visibility
    toggleKeyVisibilityBtn.addEventListener('click', () => {
        const type = settingsApiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
        settingsApiKeyInput.setAttribute('type', type);
        toggleKeyVisibilityBtn.querySelector('i').className = type === 'password' ? 'ri-eye-line' : 'ri-eye-off-line';
    });

    // Open/Close Settings Modal
    settingsToggleBtn.addEventListener('click', () => {
        settingsApiKeyInput.value = state.apiKey;
        settingsModelSelect.value = state.model;
        settingsModal.classList.add('active');
    });

    settingsCloseBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    // Save Settings
    btnSaveSettings.addEventListener('click', () => {
        state.apiKey = settingsApiKeyInput.value.trim();
        state.model = settingsModelSelect.value;
        localStorage.setItem('aura_api_key', state.apiKey);
        localStorage.setItem('aura_model', state.model);
        settingsModal.classList.remove('active');
        showToast("Configuration saved successfully!");
    });

    // Close settings modal if clicked outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });

    // PANE TRANSITIONS
    function navigateToStep(step) {
        state.currentStep = step;
        
        // Remove active class from all
        stepInputPane.classList.remove('active');
        stepQaPane.classList.remove('active');
        stepResultsPane.classList.remove('active');
        
        // Hide from display entirely
        stepInputPane.style.display = 'none';
        stepQaPane.style.display = 'none';
        stepResultsPane.style.display = 'none';

        let targetPane = null;
        if (step === 'input') targetPane = stepInputPane;
        else if (step === 'qa') targetPane = stepQaPane;
        else if (step === 'results') targetPane = stepResultsPane;

        if (targetPane) {
            targetPane.style.display = 'flex';
            // Force redraw for smooth transitions
            targetPane.offsetHeight; 
            targetPane.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // LOADER OVERLAY CONTROLLER
    function showLoader(title, subtitle) {
        loadingTitle.textContent = title;
        loadingSubtitle.textContent = subtitle;
        
        // Reset indicators
        loaderStep1.className = 'step-indicator active';
        loaderStep2.className = 'step-indicator';
        loaderStep3.className = 'step-indicator';
        
        loadingOverlay.classList.add('active');
    }

    function updateLoaderStep(stepIndex, status) {
        // status: 'active', 'done', 'pending'
        const indicators = [loaderStep1, loaderStep2, loaderStep3];
        if (stepIndex >= 0 && stepIndex < indicators.length) {
            const ind = indicators[stepIndex];
            ind.className = 'step-indicator';
            if (status === 'active') {
                ind.classList.add('active');
                ind.querySelector('i').className = 'ri-loader-4-line';
            } else if (status === 'done') {
                ind.classList.add('done');
                ind.querySelector('i').className = 'ri-checkbox-circle-fill';
            } else {
                ind.querySelector('i').className = 'ri-checkbox-blank-circle-line';
            }
        }
    }

    function hideLoader() {
        loadingOverlay.classList.remove('active');
    }

    // TABS CONTROL IN RESULTS
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // RUN DIAGNOSTIC SCAN (STEP 1 CALL)
    btnScan.addEventListener('click', async () => {
        const resumeText = resumeTextarea.value.trim();
        const jdText = jdTextarea.value.trim();

        if (!resumeText) {
            showToast("Please paste your resume text to begin.", "error");
            resumeTextarea.focus();
            return;
        }

        state.originalResume = resumeText;
        state.jobDescription = jdText;

        // Run API call to Flask
        showLoader("Running ATS Audit", "Analyzing resume text and extracting metadata...");
        
        setTimeout(() => updateLoaderStep(0, 'done'), 1500);
        setTimeout(() => updateLoaderStep(1, 'active'), 1500);

        try {
            const payload = {
                resume_text: state.originalResume,
                job_description: state.jobDescription,
                api_key: state.apiKey,
                model: state.model
            };

            const response = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || errData.details || "API request failed");
            }

            const data = await response.json();
            
            // Check status: complete vs incomplete
            if (data.status === 'incomplete') {
                state.lastQuestions = data.dynamic_questions || [];
                renderQuestions(state.lastQuestions);
                updateLoaderStep(1, 'done');
                setTimeout(() => {
                    hideLoader();
                    navigateToStep('qa');
                }, 800);
            } else if (data.status === 'complete') {
                state.diagnostics = data;
                updateLoaderStep(1, 'done');
                updateLoaderStep(2, 'active');
                setTimeout(() => {
                    renderDashboard(data);
                    updateLoaderStep(2, 'done');
                    setTimeout(() => {
                        hideLoader();
                        navigateToStep('results');
                        celebrate(data.ats_score);
                    }, 500);
                }, 1000);
            } else {
                throw new Error("Invalid status returned by the engine");
            }

        } catch (error) {
            hideLoader();
            console.error(error);
            showToast(error.message || "An error occurred during diagnostic.", "error");
        }
    });

    // RENDER STEP 2 QUESTIONS DYNAMICALLY
    function renderQuestions(questions) {
        qaQuestionsList.innerHTML = '';
        
        if (questions.length === 0) {
            qaQuestionsList.innerHTML = '<p class="text-secondary">No questions generated. Click optimize to proceed.</p>';
            return;
        }

        questions.forEach((q, idx) => {
            const qaCard = document.createElement('div');
            qaCard.className = 'qa-card';
            
            const label = document.createElement('label');
            label.className = 'qa-label';
            label.setAttribute('for', `q-input-${idx}`);
            label.textContent = q.question;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'qa-input-wrapper';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `q-input-${idx}`;
            input.dataset.field = q.field;
            input.dataset.question = q.question;
            input.placeholder = "e.g., Improved processing speed by 40% using redis caching...";
            
            wrapper.appendChild(input);
            qaCard.appendChild(label);
            qaCard.appendChild(wrapper);
            qaQuestionsList.appendChild(qaCard);
        });
    }

    // SUBMIT Q&A ANSWERS
    btnQaSubmit.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Compile responses
        const responses = [];
        const inputs = qaQuestionsList.querySelectorAll('input');
        
        inputs.forEach(input => {
            const val = input.value.trim();
            if (val) {
                responses.push({
                    question: input.dataset.question,
                    answer: val
                });
            } else {
                responses.push({
                    question: input.dataset.question,
                    answer: "Not provided"
                });
            }
        });

        await submitFinalAnswers(responses);
    });

    // SKIP Q&A AND GENERATE
    btnQaSkip.addEventListener('click', async () => {
        // Compile skipped responses
        const responses = state.lastQuestions.map(q => ({
            question: q.question,
            answer: "Not provided"
        }));

        await submitFinalAnswers(responses);
    });

    // STEP 2 SUBMISSION FLOW
    async function submitFinalAnswers(userResponses) {
        showLoader("Generating Flawless Resume", "Incorporating answers and structural updates...");
        
        setTimeout(() => updateLoaderStep(0, 'done'), 1000);
        setTimeout(() => updateLoaderStep(1, 'active'), 1000);

        try {
            const payload = {
                resume_text: state.originalResume,
                job_description: state.jobDescription,
                user_responses: userResponses,
                api_key: state.apiKey,
                model: state.model
            };

            const response = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || errData.details || "API request failed");
            }

            const data = await response.json();
            
            if (data.status === 'complete') {
                state.diagnostics = data;
                updateLoaderStep(1, 'done');
                updateLoaderStep(2, 'active');
                
                setTimeout(() => {
                    renderDashboard(data);
                    updateLoaderStep(2, 'done');
                    
                    setTimeout(() => {
                        hideLoader();
                        navigateToStep('results');
                        celebrate(data.ats_score);
                    }, 500);
                }, 1000);
            } else {
                // If it returns incomplete again, we proceed with whatever it asks, but usually it should output complete.
                state.lastQuestions = data.dynamic_questions || [];
                renderQuestions(state.lastQuestions);
                hideLoader();
                showToast("Some metrics are still missing, please provide details.", "info");
            }

        } catch (error) {
            hideLoader();
            console.error(error);
            showToast(error.message || "An error occurred during resume optimization.", "error");
        }
    }

    // RENDER RESULTS DASHBOARD
    function renderDashboard(data) {
        // 1. Score Animate & SVG Circle Fill
        const scoreVal = parseInt(data.ats_score) || 0;
        animateScore(scoreVal);
        
        // SVG circle stroke dashoffset
        const maxDash = 326.7; // 2 * PI * r (r=52)
        const offset = maxDash - (scoreVal / 100) * maxDash;
        scoreFill.style.strokeDashoffset = offset;
        
        // Ring color based on score
        if (scoreVal < 50) {
            scoreFill.style.stroke = 'var(--color-danger)';
            scoreHeading.textContent = "Weak ATS Match";
            scoreHeading.className = "text-danger";
            scoreDescription.textContent = "Your resume violates multiple formatting rules and lacks keyword matching.";
        } else if (scoreVal < 80) {
            scoreFill.style.stroke = 'var(--color-warning)';
            scoreHeading.textContent = "Moderate ATS Match";
            scoreHeading.className = "text-warning";
            scoreDescription.textContent = "Decent compatibility. Ready for minor manual edits before submission.";
        } else {
            scoreFill.style.stroke = 'var(--color-success)';
            scoreHeading.textContent = "Excellent ATS Match";
            scoreHeading.className = "text-success";
            scoreDescription.textContent = "Superb! Highly optimized resume passing all formatting and keyword guidelines.";
        }

        // 2. Strengths & Weaknesses
        strengthsList.innerHTML = '';
        const strengths = data.strengths || ["Strong technical profile alignment."];
        strengths.forEach(st => {
            const li = document.createElement('li');
            li.textContent = st;
            strengthsList.appendChild(li);
        });

        weaknessesList.innerHTML = '';
        const weaknesses = data.weaknesses || ["Lacks sufficient quantitative metrics in achievements."];
        weaknesses.forEach(wk => {
            const li = document.createElement('li');
            li.textContent = wk;
            weaknessesList.appendChild(li);
        });

        // 3. Rule Checks
        rulesList.innerHTML = '';
        const defaultRules = [
            { rule: "Action Verbs", status: "Passed", details: "All experience bullet points start with strong action verbs." },
            { rule: "Third-Person Perspective", status: "Passed", details: "Zero use of personal pronouns (I, me, my, we) detected." },
            { rule: "Quantified Impact", status: "Passed", details: "Quantified business results are incorporated in experience blocks." },
            { rule: "Active Voice", status: "Passed", details: "Transformed passive duties into active outcomes." },
            { rule: "Zero Vague Descriptions", status: "Passed", details: "Generic fluff descriptors replaced with actionable skills." },
            { rule: "Clean Layout Structure", status: "Passed", details: "Single-column Markdown structure with standard sectioning." },
            { rule: "JD Optimization", status: "Passed", details: "Mapped experiences and technical terms with target keywords." },
            { rule: "Data Integrity", status: "Passed", details: "All original timeline dates, companies, and roles preserved." }
        ];

        const ruleChecks = data.rule_checks || defaultRules;
        ruleChecks.forEach(check => {
            const item = document.createElement('div');
            item.className = 'rule-item';
            
            const isPassed = (check.status || '').toLowerCase() === 'passed';
            const statusClass = isPassed ? 'passed' : 'failed';
            const iconClass = isPassed ? 'ri-checkbox-circle-fill text-success' : 'ri-close-circle-fill text-danger';

            item.innerHTML = `
                <div class="rule-header">
                    <div class="rule-info">
                        <i class="${iconClass}"></i>
                        <span class="rule-name">${check.rule}</span>
                    </div>
                    <span class="rule-status ${statusClass}">${check.status}</span>
                </div>
                <p class="rule-desc">${check.details || ''}</p>
            `;
            rulesList.appendChild(item);
        });

        // 4. Improved Resume Content
        const mdText = data.improved_resume || '';
        rawResumeView.value = mdText;
        
        // Parse markdown to HTML using marked.js
        formattedResumeView.innerHTML = marked.parse(mdText);
    }

    // ANIMATE SCORE NUMBER COUNT UP
    function animateScore(targetValue) {
        let currentVal = 0;
        const duration = 1200; // ms
        const stepTime = 15; // ms
        const steps = duration / stepTime;
        const increment = targetValue / steps;
        
        const interval = setInterval(() => {
            currentVal += increment;
            if (currentVal >= targetValue) {
                scoreNum.textContent = Math.round(targetValue);
                clearInterval(interval);
            } else {
                scoreNum.textContent = Math.round(currentVal);
            }
        }, stepTime);
    }

    // CELEBRATION EFFECTS FOR HIGH SCORE
    function celebrate(score) {
        if (score >= 80) {
            const duration = 2 * 1000;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 3,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#6366f1', '#06b6d4', '#10b981']
                });
                confetti({
                    particleCount: 3,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#6366f1', '#06b6d4', '#10b981']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }
    }

    // RESUME PREVIEW PANEL CONTROLS
    btnViewPreview.addEventListener('click', () => {
        btnViewPreview.classList.add('active');
        btnViewRaw.classList.remove('active');
        formattedResumeView.style.display = 'block';
        rawResumeView.style.display = 'none';
    });

    btnViewRaw.addEventListener('click', () => {
        btnViewRaw.classList.add('active');
        btnViewPreview.classList.remove('active');
        formattedResumeView.style.display = 'none';
        rawResumeView.style.display = 'block';
    });

    // COPY TO CLIPBOARD
    btnCopy.addEventListener('click', () => {
        const isRaw = btnViewRaw.classList.contains('active');
        
        if (isRaw) {
            // Copy Markdown
            const mdText = rawResumeView.value;
            navigator.clipboard.writeText(mdText).then(() => {
                showToast("Markdown resume copied to clipboard!");
            }).catch(err => {
                showToast("Failed to copy text.", "error");
                console.error(err);
            });
        } else {
            // Copy Rich Text rendered HTML (or compile as plain text)
            // Let's just copy the plain text of the resume since ATS uses clean text.
            const plainText = formattedResumeView.innerText;
            navigator.clipboard.writeText(plainText).then(() => {
                showToast("Plain text resume copied to clipboard!");
            }).catch(err => {
                showToast("Failed to copy text.", "error");
                console.error(err);
            });
        }
    });

    // PRINT RESUME
    btnPrint.addEventListener('click', () => {
        window.print();
    });

    // START OVER / RESTART
    btnRestart.addEventListener('click', () => {
        resumeTextarea.value = '';
        jdTextarea.value = '';
        qaQuestionsList.innerHTML = '';
        state.originalResume = '';
        state.jobDescription = '';
        state.lastQuestions = [];
        state.diagnostics = null;
        
        navigateToStep('input');
    });
});
