#1
This will be a push-based integration, ShoppersStop needs to consume Darwinbox APIs to push the attendance punches. The
scope of this integration will be limited to the employee strength of 10,000 (considering that maximum 1,00,000 attendance
punches will be pushed in a day)

#2
This will be a bi-directional integration where for the external system (Naukri) Darwinbox will consume Naukri’s APIs to push the
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

1. Establish an updated connection between the Group HR System (Darwinbox) and Willis Tower Watson using Darwinbox’s
   iPaaS layer (Studio).
2. The integration will sync updates of all active employees and terminated employees (for only till Date of exit as last 1 month
   form current date).

#6
The outbound and inbound interface between the Darwinbox HCM system and Piramal shall support the requirements listed below:
Provide the Piramal Internal system with the input fields required for Cibil Verification.
Piramal tech team must use Darwinbox inbound API to push back the final status, final comments, final report and 1 additional attachment (if required) in Darwinbox once they have
received the details from CIBIL.
