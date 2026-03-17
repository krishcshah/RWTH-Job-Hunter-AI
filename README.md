# RWTH Job Hunter AI

This application automates the process of finding relevant job openings at RWTH Aachen University. It scrapes current job listings, parses your uploaded resume, and uses a large language model to recommend positions that match your skills and experience.

## How It Works

The application operates in three main phases:

1. Resume Parsing
Users upload their resume in PDF format. The frontend sends this file to a Node.js backend, which uses the pdf-parse library to extract the raw text from the document.

2. Job Scraping
The application fetches current job postings directly from the RWTH Aachen job portal. The backend uses Cheerio to parse the HTML of the job board, extracting critical details such as the job title, department, required profile, responsibilities, and application links. To prevent rate limiting, the scraping is done in batches.

3. AI Matching
Once the resume is parsed and the jobs are scraped, the data is sent to the Gemini API. The model evaluates the semantic fit between your resume text and the requirements of each job posting. It then returns a list of recommended job reference numbers.

4. Data Visualization
The frontend displays all scraped jobs in an interactive data grid using AG Grid. Once the matching process is complete, users can toggle a filter to view only the jobs that the AI recommended for their specific profile.

## How It Was Built

The project is structured as a full-stack JavaScript application.

Frontend:
* React 19: For building the user interface.
* Vite: For fast development and building.
* Tailwind CSS: For utility-first styling.
* AG Grid: For rendering the high-performance data table of job listings.
* Lucide React: For clean, consistent iconography.

Backend:
* Node.js with Express: To serve the API endpoints.
* Multer: For handling multipart/form-data and processing the PDF file uploads.
* PDF-Parse: For extracting text from the uploaded resumes.
* Cheerio: For server-side HTML parsing and web scraping.

AI Integration:
* @google/genai: The official SDK for interacting with the Gemini models to perform the resume-to-job matching.

## How to Use

### Prerequisites
You will need Node.js installed on your machine and a valid Gemini API key.

### Local Setup

1. Install Dependencies
Run the following command in the root directory to install all required packages:
npm install

2. Environment Variables
Create a file named .env in the root directory. You can copy the structure from .env.example. Add your API key to this file:
GEMINI_API_KEY="your_api_key_here"

3. Start the Application
Start the development server, which runs both the Vite frontend and the Express backend concurrently:
npm run dev

4. Access the App
Open your browser and navigate to the local URL provided in your terminal (typically http://localhost:3000).

### Usage Steps
1. Click the upload area to select and upload your PDF resume.
2. Wait for the text extraction to complete.
3. Click the "Scrape Jobs" button to fetch the latest listings from the RWTH portal.
4. Once the jobs are loaded, click "Match Jobs" to run the AI analysis.
5. Use the grid controls to filter, sort, and review your recommended jobs.

### License
MIT
