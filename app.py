import os
import json
import logging
import threading
import requests
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv

# Load environment variables from .env file securely

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Prefilled fallback values
DEFAULT_MODEL = "gemini-2.5-flash-lite"

# Production API Key Rotator Class to load-balance RPM, TPM, and RPD limits
class APIKeyRotator:
    def __init__(self):
        # Retrieve keys from environment variable (comma-separated) securely
        env_keys = os.getenv('GEMINI_API_KEYS', '').strip()
        if env_keys:
            self.keys = [k.strip() for k in env_keys.split(',') if k.strip()]
            logger.info(f"Loaded {len(self.keys)} API keys from GEMINI_API_KEYS environment variable.")
        else:
            self.keys = []
            logger.warning("GEMINI_API_KEYS environment variable is not set or empty. API key rotation pool is empty.")
        
        self.lock = threading.Lock()
        self.current_index = 0

    def get_next_index_and_rotate(self):
        """Returns the current index and moves the pointer to the next key (thread-safe)."""
        with self.lock:
            if not self.keys:
                return 0
            idx = self.current_index
            self.current_index = (self.current_index + 1) % len(self.keys)
            return idx

    def get_all_keys(self):
        """Returns the list of all loaded API keys."""
        return self.keys

# Initialize the global rotator
rotator = APIKeyRotator()

@app.route('/')
def index():
    """Serves the dashboard index page."""
    return render_template('index.html')

@app.route('/api/diagnose', methods=['POST'])
def diagnose():
    """
    Accepts resume_text, job_description, and user_responses.
    Sends a structured prompt to the Gemini API using key rotation and failover.
    Returns the parsed JSON response.
    """
    try:
        data = request.json or {}
        resume_text = data.get('resume_text', '').strip()
        job_description = data.get('job_description', '').strip()
        user_responses = data.get('user_responses', [])
        
        custom_api_key = data.get('api_key', '').strip()
        model = data.get('model', DEFAULT_MODEL) or DEFAULT_MODEL

        if not resume_text:
            return jsonify({"error": "Resume text is required"}), 400

        # Construct XML-style inputs
        resume_xml = f"<resume_text>\n{resume_text}\n</resume_text>"
        
        jd_xml = ""
        if job_description:
            jd_xml = f"<job_description>\n{job_description}\n</job_description>"
            
        responses_xml = ""
        if user_responses:
            responses_xml = "<user_responses>\n"
            for resp in user_responses:
                q = resp.get('question', '')
                a = resp.get('answer', '')
                responses_xml += f"  <item>\n    <question>{q}</question>\n    <answer>{a}</answer>\n  </item>\n"
            responses_xml += "</user_responses>"

        # Prepare the system prompt instructing the model on constraints, output format, and steps
        prompt = f"""You are the core engine of an AI-Powered ATS Resume Diagnostic and Rewriting Tool. Your job is to process raw user inputs (existing resume text, job descriptions, and user answers) to achieve three goals: assess compatibility, extract missing details dynamically, and generate a flawless, ATS-optimized resume.

INPUTS:
{resume_xml}

{jd_xml}

{responses_xml}

OPERATIONAL MODES & STEPS:

### STEP 1: Extraction & Gap Analysis
Analyze the provided <resume_text> and <job_description>. Check for the presence of crucial fields: Full Name, Email/Contact, Education (College, Degree, Graduation Year), Core Technical Skills, and structural details (durations, metric-less bullets).
If critical pieces are missing, OR if metrics are absent from major achievements, AND the user has not provided answers to these gaps in <user_responses>, you MUST STOP and output a JSON response containing a list of targeted questions to ask the user. Generate these questions dynamically based on what is missing or weak (e.g., asking for specific numbers, metrics, or missing contact/graduation details).

Response Structure for Step 1 (Incomplete Data):
{{
  "status": "incomplete",
  "missing_fields": ["phone_number", "graduation_year", "project_metrics"],
  "dynamic_questions": [
    {{"field": "phone_number", "question": "What is your primary contact number for the resume header?"}},
    {{"field": "project1_metric", "question": "In your project [Project Name], you mentioned improving speed. By what percentage or factor did it improve?"}}
  ]
}}

### STEP 2: Diagnostic & Generation
Once all necessary data is gathered (or if the user has provided <user_responses> to address the missing information), output a final JSON payload. Incorporate the answers from <user_responses> to enrich the resume content. Do not ask more questions if the user has answered the previous questions; proceed to generate the final resume.

You must rigorously enforce these 8 constraints on the output resume:
1. Action Verbs: Every bullet point must begin with a strong, distinct action verb.
2. Third-Person Perspective: Completely eliminate first-person pronouns (I, me, my, we).
3. Quantified Impact: Every major achievement must include metrics (%, $, time, volume). If missing, flag it in the weaknesses.
4. Active Voice: Rewrite all passive phrasing to active.
5. Zero Vague Descriptions: Remove fluff ("team player", "hard worker") and replace with technical skills or exact outcomes.
6. Clean Layout Structure: Format output in clean, scannable Markdown (Header, Summary, Experience, Projects, Skills, Education). No complex columns or tables.
7. JD Optimization: Map experience against the provided Job Description (if available) to integrate critical keywords naturally.
8. Data Integrity: Retain 100% of the candidate's actual history. Do not invent fake companies or fake degrees.

Response Structure for Step 2 (Final Processed Output):
{{
  "status": "complete",
  "ats_score": 85,
  "rule_checks": [
    {{"rule": "Action Verbs", "status": "Passed", "details": "All bullet points successfully updated to start with powerful verbs."}},
    {{"rule": "Third-Person Perspective", "status": "Passed", "details": "Removed all first-person pronouns."}},
    {{"rule": "Quantified Impact", "status": "Passed", "details": "Quantified major achievements with percentage and dollar impact metrics."}},
    {{"rule": "Active Voice", "status": "Passed", "details": "Converted passive voice expressions into active phrasing."}},
    {{"rule": "Zero Vague Descriptions", "status": "Passed", "details": "Replaced generic self-descriptions with specific technical projects and tools."}},
    {{"rule": "Clean Layout Structure", "status": "Passed", "details": "Structured resume in clean Markdown with clear heading hierarchy."}},
    {{"rule": "JD Optimization", "status": "Passed", "details": "Integrated target keywords from the Job Description."}},
    {{"rule": "Data Integrity", "status": "Passed", "details": "Retained all historical candidate dates, companies, and roles without fabrications."}}
  ],
  "strengths": [
    "Strong technical stack alignment with targeted job description.",
    "Clear academic pedigree showing college, degree, and graduation year.",
    "Highly quantified project impact demonstrating business results."
  ],
  "weaknesses": [
    "Original version contained heavy first-person pronoun usage (e.g. 'I led', 'my team').",
    "Unquantified project metrics in earlier versions.",
    "Passive voice phrasing ('was responsible for')."
  ],
  "improved_resume": "# [Candidate Name]\\n\\n## Professional Summary\\n... (Insert complete optimized Markdown resume)"
}}

OUTPUT FORMAT SPECIFICATION:
You must communicate ONLY in valid JSON. Do not include markdown code blocks (like ```json ... ```) in your response. It must be directly parseable as a JSON object. Ensure proper escaping of special characters, newlines (use \\n), and quotes inside the JSON string.
"""

        # Prepare Gemini Request Payload
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2
            }
        }
        headers = {'Content-Type': 'application/json'}

        # Determine which API Key(s) to attempt
        if custom_api_key:
            logger.info("Using custom API key provided in request settings.")
            keys_to_attempt = [custom_api_key]
        else:
            keys_pool = rotator.get_all_keys()
            if not keys_pool:
                logger.error("No API keys found in the rotation pool.")
                return jsonify({
                    "error": "Application Configuration Error",
                    "details": "No API keys are configured in the server environment. Please set GEMINI_API_KEYS in your .env file or Render environment variables."
                }), 500
            
            start_index = rotator.get_next_index_and_rotate()
            # Shift the pool to begin at the current round-robin pointer index
            keys_to_attempt = keys_pool[start_index:] + keys_pool[:start_index]

        response = None
        success = False
        last_error = ""

        # Loop through keys to handle RPM/TPM Rate limits (HTTP 429) & Quota limits (HTTP 403)
        for idx, key in enumerate(keys_to_attempt):
            masked_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "invalid"
            logger.info(f"Attempting API call (Key index {idx+1}/{len(keys_to_attempt)}): {masked_key}")

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
            
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=60)
                
                if response.status_code == 200:
                    success = True
                    break
                elif response.status_code == 429:
                    logger.warning(f"Rate Limit (429) hit for key {masked_key}. Retrying with another key...")
                    last_error = f"Rate Limit (HTTP 429): {response.text}"
                elif response.status_code in [400, 403]:
                    logger.warning(f"Authentication/Quota error ({response.status_code}) hit for key {masked_key}. Retrying with another key...")
                    last_error = f"Auth/Quota Error (HTTP {response.status_code}): {response.text}"
                else:
                    logger.warning(f"Unexpected response code {response.status_code} for key {masked_key}. Retrying with another key...")
                    last_error = f"HTTP {response.status_code}: {response.text}"
                    
            except requests.exceptions.RequestException as re:
                logger.error(f"Network error calling Gemini API with key {masked_key}: {str(re)}")
                last_error = f"Network Exception: {str(re)}"

        if not success:
            logger.error("All keys in the rotation pool failed to generate content.")
            return jsonify({
                "error": "Failed to communicate with Gemini API across all keys in the rotator pool",
                "details": last_error
            }), 502

        # Extract generated content
        response_data = response.json()
        try:
            candidates = response_data.get('candidates', [])
            if not candidates:
                return jsonify({"error": "No response generated by the model"}), 500
                
            generated_text = candidates[0].get('content', {}).get('parts', [])[0].get('text', '')
            logger.info("Successfully received response from Gemini API.")
            
            # Parse the response text as JSON
            parsed_response = json.loads(generated_text)
            return jsonify(parsed_response)
            
        except json.JSONDecodeError as jde:
            logger.error(f"Failed to parse model output as JSON: {generated_text}")
            return jsonify({
                "error": "Model output was not valid JSON",
                "raw_output": generated_text,
                "exception": str(jde)
            }), 500
        except Exception as ex:
            logger.error(f"Unexpected error parsing response: {str(ex)}")
            return jsonify({"error": "Failed to process API response", "details": str(ex)}), 500

    except Exception as e:
        logger.exception("An error occurred during diagnosis.")
        return jsonify({"error": "Internal Server Error", "details": str(e)}), 500

if __name__ == '__main__':
    # Respect Render's PORT environment variable during deployment, default to 5001 locally
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, host='0.0.0.0', port=port)
