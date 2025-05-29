#1
This will be a push-based integration, ShoppersStop needs to consume Darwinbox APIs to push the attendance punches. The
scope of this integration will be limited to the employee strength of 10,000 (considering that maximum 1,00,000 attendance
punches will be pushed in a day)

#2
This will be a bi-directional integration where for the external system (Naukri) Darwinbox will consume Naukri's APIs to push the
job. As a part of Job Posting the scope of this integration will be limited to creating the Job (via Posting), fetching the Job Posting
URL, editing the job (via Reposting), and deleting the job (via Unposting) on Naukri. This activity will be performed on a real-time
basis and subjected to the response given by the Naukri APIs.
For fetching the candidate who applies Darwinbox will call the Naukri APIs to pull the data of the candidates who apply on
Naukri. Where we perform the necessary transformations and then push the data into the respective jobs in the Darwinbox
recruitment module. This activity can be performed once every day.

#3
This is an inbound API used for adding attendance punches marked by the employees. This API can be used to push multiple attendance
punches for multiple employees.

#4
This API is used to fetch the complete roster of the daily attendance of the employees. The roster includes information such as clock-in
time, clock-out time, total working hours, break duration, attendance regularization details, if any, shift details, week off details, etc. for a
specified date range.

#5
The outbound interface between the Darwinbox HCM system and Willis Tower Watson is designed to support the following
requirements:

1. Establish an updated connection between the Group HR System (Darwinbox) and Willis Tower Watson using Darwinbox's
   iPaaS layer (Studio).
2. The integration will sync updates of all active employees and terminated employees (for only till Date of exit as last 1 month
   form current date).

#6
The outbound and inbound interface between the Darwinbox HCM system and Piramal shall support the requirements listed below:
Provide the Piramal Internal system with the input fields required for Cibil Verification.
Piramal tech team must use Darwinbox inbound API to push back the final status, final comments, final report and 1 additional attachment (if required) in Darwinbox once they have
received the details from CIBIL.

#7
**API-Based Inbound Integration - Real-Time Employee Data Synchronization**

• This integration establishes a real-time, API-based inbound data flow from the client's HRIS system to Darwinbox for employee lifecycle management
• Utilizes REST API endpoints (POST /api/v1/employees, PUT /api/v1/employees/{id}) with OAuth 2.0 authentication to ensure secure data transmission
• Supports both individual employee updates and bulk data processing operations to accommodate varying business scenarios from single hire to mass onboarding events
• Implements comprehensive data validation and transformation logic to maintain data integrity across Employee Management and Core HR modules
• Designed to handle up to 5,000 employee records per hour with automatic retry mechanisms and error handling for failed transactions

#8
**Standard Integration - File-Based Payroll Data Exchange**

• This integration implements a standard file-based approach for bi-directional payroll data exchange between the client's payroll system and Darwinbox
• Utilizes secure SFTP file transfer with predefined CSV/Excel templates for structured data exchange on a scheduled basis (daily/weekly/monthly)
• Supports comprehensive payroll data including salary components, deductions, tax calculations, and compliance reporting requirements
• Implements automated file validation, processing status notifications, and error reporting to ensure data accuracy and processing transparency
• Designed to process payroll files containing up to 10,000 employee records with detailed audit trails and reconciliation capabilities

#9
**Custom Development Integration - Biometric Attendance Management**

• This integration provides a custom-developed solution for real-time biometric attendance data processing from multiple device vendors to Darwinbox
• Implements custom API endpoints with specialized data transformation logic to handle diverse biometric device formats and protocols
• Supports real-time attendance punch processing with advanced duplicate detection, validation rules, and business logic for shift management
• Integrates with Darwinbox Attendance module to provide comprehensive workforce management including overtime calculations, leave adjustments, and policy compliance
• Designed to process up to 100,000 attendance punches daily across multiple locations with real-time monitoring and alerting capabilities

#10
The integration will involve the below data touchpoint:
Get the list of Candidates to be added to the Pending List by calling Candidate List API. All the candidates whose status is Offer Accepted and to be added to pending list (only
those cases for which the offer letter and flow was generated from Darwinbox) will come in the Candidate list API response.
Call the Candidate Detail API for the candidates obtained from the Candidate List API and gather the specific candidate fields from the offer and pre-offer JSON that are mandatory
for candidate addition.
Call the Add to pending list API to add the candidates having status Offer Accepted and to be added to pending list (only those cases for which the offer letter and flow was
generated from Darwinbox) in the pending state.
Call the Update Employee Record API to update the Clock-in priority of the candidate.
Provide client team with proper logs in case of error and success.
The diagram below depicts the flow and the direction of data transfer for this inbound and outbound integration:
Special Note-
Disclaimer: Please review this section in the BRD with careful attention and considerationOnly the fields listed below in mapping section will be synced automatically from recruitment to the candidate's core profile. Any documents and additional data gathered
through the candidate's job application form will not undergo automatic synchronization. Instead, HR will need to manually input all remaining fields.
NOTE- It is advisable to gather the majority of the fields from the candidate during the onboarding stage.
If an offer letter is generated offline for a candidate such as when HR/recruiter directly updates the candidate's offer stage status to Offer Accepted and to be added to the
pending list, that candidate will not be included in the Candidate List API. Therefore, this particular scenario falls outside the scope of this connector.
In such cases, the client will need to manually add these candidates in the pending state. Here is an example of a situation that is categorized as offline offer letter generation-
HR/ Recruiter needs to click on Generate offer letter as shown below-
We will also handle the case where a candidate initially accepts the offer but later declines it. If HR generates a new offer letter and the candidate accepts it this time, they will
be added to the pending list again since the candidate ID remains the same. HR must ensure that the employee's profile is deleted before sharing the revised offer letter.

#11
The integration will involve the below integration touchpoints coming in from Darwinbox HCM to SAP of the Altius environment
using Reimbursement APIs and relevant APIs and an Altius SFTP to place the final file. There will also be a downloadable option
of the file in Reports -Flow
Sample Screen for Approver:Additional Logic:

1. If any entries are rejected, they will be comma separated entries and will not flow to FCR and neither will they get updated.
2. If entire flow rejected, no run will happen on the day.

#12
The integration will involve the below integration touchpoints coming in from Darwinbox HCM to MS On Premises AD AD of
Darwinbox using relevant Darwinbox and Graph APIs -
No changes made in MS On Premises AD will reflect in Darwinbox. The integration will be uni-directional only.

#13
The integration will involve the below integration touchpoints coming in from Darwinbox HCM to SAP of the Hetero environment
using Payroll Reports and relevant APIs and an SAP PI/PO endpoint

#14
The integration will involve the below integration touchpoints coming in from Darwinbox HCM to Open Air and fetch back MS
Azure AD of Darwinbox using relevant Darwinbox and Graph APIs -
No changes made in MS Azure will reflect in Darwinbox. The integration will be uni-directional only.
