#1
Posting a job to Naukri
Create a job using the recruitment module of Darwinbox after completing the 5 basic steps (Job Details, Job Posting, Job
Application, Hiring Workflow, Hiring Team)You need to make sure that the job is active on Darwinbox careers webpage –
You can edit the job and go to Job Posting>>SOURCES>>JOB BOARD>> “Share this job on Naukri”
Please go through the important instructions mentioned in the tool tip –After you click on “POST TO NAUKRI”, Darwinbox calls Naukri API to push the job details and the job gets posted to Naukri.
You can now click on “Get link Of Job Posted On Naukri Portal” to get the URL of the job which is posted at Naukri -
Re-posting a job to Naukri (In case the job gets edited in Darwinbox)
If you are making a change in the job in Darwinbox recruitment module (for eg – you are updating the experience range
required), you can re-post the job to Naukri for pushing the update.
Naukri takes a few minutes to process these changes post which these updates start reflecting on Naukri.Un posting a job (Removing an already posted job from Naukri)
You can remove a job via - Job Posting>>SOURCES>>JOB BOARD>> “Share this job on Naukri”>>UNPOST
Job also gets automatically unposted if you remove the job from careers, if you put the job on hold or if you archive the job in
Darwinbox recruitment module.
Fetching the data for candidates applying in Naukri
Darwinbox calls Naukri APIs to pull the data of the candidates who apply on Naukri.
We perform the necessary transformations and then push the data into the respective jobs in the Darwinbox recruitment
module.
This activity can be performed once every day.
The scheduler will run twice a day (For Fetching the Candidiate Applies from Naukri and creating Candidate Profile in
Darwinbox)6 AM (for fetching the applies from 2 PM of the previous day till 6 AM of the current date)
2 PM (for fetching the applies from 6 AM of the current day till 2 PM of the current date)
If the candidate has applied on the Naukri at 1:45 PM and his application is taking 15 mins or more to reflect into the
Naukri’s API. (i.e. his profile is not created before 2 PM), then his application will be pushed into the next scheduler (i.e. next
day at 6 AM).
The following attributes will be populated in the Candidates' Job Application Form in Darwinbox.
Darwinbox Field Name [Type]
Naukri Field Name (From Naukri API)
Notes and Logic
Salutation [Dropdown]SalutationFirst Name [Text]FirstNameLast Name [Text]LastNameMiddle Name [Text]MiddleNameGender [Dropdown]GenderDate of Birth (in DD-MM-YYYY format)DateofBirthNationality [Dropdown]NationalityPersonal Email ID [Text]EmailCountry Code Personal [Dropdown]CountryCodePersonal mobile no [Text]MobileComapny [Text]CurrentEmployerFrom Date [Date]StartDateTo Date [Date]EndDateEducation Category [Dropdown]EducationLevelDarwinbox has maintained an internal
masters for field mapping of these
dropdowns. (For example, if in Naukri
we have UG and in Darwinbox it will be
populated as Bachelor's Degree).
If any category present in Naukri is not
mapped with Darwinbox dropdown
values, then the same will be populated
in a text area.
Educational degree [Dropdown]DegreeDarwinbox has maintained an internal
masters for field mapping of these
dropdowns. (For example, if in Naukri
we have B.A and in Darwinbox it will be
populated as Bachelor of Arts - BA).
If any category present in Naukri is not
mapped with Darwinbox dropdown
From Naukri we will receive values only
as “M“ ,“F“ and “T”. Hence these will be
mapped to Dropdown values of “Male“
,“Female“, and “Transgender”
Hardcoded as “+91”Field of Sepecialisation [Dropdown]Specialisation
GPA/Percentage [Text]Percentage
Total CTC [Text]CurrentCTC
Expected CTC [Text]ExpectedCTC
Darwinbox has maintained an internal
masters for field mapping of these
dropdowns. (For example, if in Naukri
we have Zoology and in Darwinbox it
will be populated as Zoology/Animal
Biology).
If any category present in Naukri is not
mapped with Darwinbox dropdown
values, then the same will be popluated
in a text area.
Details provided for this integration from the Polycab Team –
Group Companies configured in Darwinbox for which integration is to be enabled (It can also be applied to all group
companies by default) -
Polycab India Limited,
Polycab Support Force Private Limited,
Uniglobus Electricals and Electronics Private Limited
Naukri Company Name - Polycab India Limited
Naukri Job Industry - The possible values which Naukri accepts are given below -
IT Services & Consulting
Textile & Apparel
...
Naukri Concise Job Posting API Endpoint - https://api.zwayam.com/amplify/v1/jobs
Naukri API Key - Shared with Polycab and Darwinbox Team confidentially
Website - https://polycab.com
Email IDs of stakeholders who are expected to receive integration success/failure notifications (for the inbound flow of
candidate information) -
Ganesh.Ambokssar@Polycab.com
Ashish.Parteek@Polycab.com

#2
Darwinbox Technical Design Specifications
Employee Data to Willis Tower Watson:
Only Employee master data will be pushed to Willis Tower Watson.
No specific exclusion logic has been provided for including or excluding employees based on group company, location,
employee type, or other criteria in the Willis Tower Watson integration file.
Updates of all Active employees and inactive employees with Date of Exit in previous 1 month of trigger date are required
as part of the integration file.
Any integration record missing data in any of the Mandatory (Y) fields will be excluded from the integration data push file.
The Visteon team will verify the 'Mandatory (Y/N)', 'Logic' and 'Sample' fields before signing off on the BRD.

#3

Technical Specifications-
In order to establish the complete end-to-end flow with Darwinbox, the Piramal tech team needs to undertake two necessary development tasks-
The Piramal tech team needs to create an API endpoint that will receive a standard JSON from Darwinbox. This JSON will be pushed as soon as the HR/recruiter clicks the "initiate"/ “re-
initiate”/ “cancel” button for the pre-BGV stage in the job hiring workflow within Darwinbox. The standard JSON payload pushed will contain essential attributes needed for CIBIL
verification. Upon receiving the standard JSON data from Darwinbox, the Piramal tech team need to carry out the necessary transformations on the standard Darwinbox JSON as per the
requirement of CIBIL.
The technical details related to endpoint are mentioned below –
HTTP verb – POST
Authentication – Basic Auth (username and password to be shared by the Vendor team to darwinbox team)Endpoint Response Structure-
In frontend, in case when JSON payload is pushed successfully to the Piramal team’s endpoint, the message attribute will show a response on the top bar in green as an alert as
soon as the verification is initiated (the exact message which will be passed in the response by the Piramal tech team will be displayed in the front end).
1- In case of success, Piramal tech team can configure the response structure as shown below-
1 {
2
3
4 }
"status": "1",
"message": "<Relevant Success Message - This will be displayed on the front end on Darwinbox>"
2- In case of error, Piramal team can configure the response structure as shown below-
1 {
2
3
4 }
"status": "0",
"message": "<Relevant Error Message - This will be displayed on the front end on Darwinbox>"
Note- The Piramal tech team will also have to capture and store attributes like “stage_unique_id”, “candidate_unique_id","bgv_id“ and custom fields name from the standard JSON
data pushed by Darwinbox, when HR/ Recruiter clicks on "initiate"/ “re-initiate”/ “cancel” button for the pre-BGV stage in the job hiring workflow within Darwinbox. These attributes
will be required while calling the Darwinbox inbound report submission API.
Once CIBIL sends back the report and status, Piramal tech team will then push back this information to Darwinbox by consuming the Darwinbox inbound API.
The technical details related to Darwinbox Inbound API are mentioned below –
Endpoint: https://{{subdomain}}.darwinbox.in/verificationapi/submitReport
Authorization: Basic auth (basic auth username and password will be shared by Darwinbox)
This has to be passed as a header -
Header
Key
Value
Sample
Authorizatio Basic base64{basic auth username:basic
n
auth password}
If my username is “test” and password is
“pass”, then the value will be -
Basic dGVzdDpwYXNz
API request body: Refer to the table below -
Parameter
Mandatory
Expected ValuesRemarks
api_keyYESAPI key configured for this endpointIt will be
provided
by the
Darwinbox
Integration
s team
candidate_uniquYESUnique Alphanumeric ID tagged to the
candidateTo be
picked up
from the
JSON sent
by
Darwinbox.
bgv_idYESID of the vendorTo be
picked up
from the
JSON sent by Darwinbox ...
Sample Payload -
Sample Response -

Standard JSON which will be pushed by Darwinbox in the following scenerios :
Scenario 1: When the HR/recruiter clicks on “INITIATE”-
Standard JSON pushed-

Scenario 2: When the HR/recruiter clicks on “REINITIATE”-
Standard JSON pushed-

Scenario 3: When the HR/recruiter clicks on “CANCEL”-
Standard JSON pushed-

Data Selection and Sorting-
Darwinbox pushes initiated, reinitiated and cancelled verification requests to vendor’s endpoint on a real time basis.
Pre-bgv is expected to be triggered after pre-offer stage.
