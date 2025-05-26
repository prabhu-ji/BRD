#1
All mandatory fields required for integration will be passed in the payload by the client.

#2
Assumptions and Error Handling
Even if there are additional fields that are mandatory in the Darwinbox job application form (and these fields are not
available/captured at Naukri’s end), we will still allow the creation of the candidate profile. However, these fields will remain
blank/unfilled. Either the HR/recruiter will have to manually fill up these attributes or at the time of pre-offer, Darwinbox will
trigger an email to the candidate for signing up and for filling the missing attributes.
Any duplicate candidate profile will not get created if duplicity settings are enabled in Darwinbox. (For example, in Darwinbox,
if the same candidate/email ID is not allowed to apply to multiple jobs at the same time and if some candidate applies to 2
different jobs posted from Darwinbox to Naukri, a duplicate candidate profile will not get created for the second job)
We have built the inbound integration in such a way that the candidate profile gets created even if there are fields tagged to
the job application for which data is not available in the Naurki API response.
An email notification containing success and error logs can be triggered to the required client stakeholders every day after the
CRON/script gets executed.

#3
Functional Checks:
Please ensure the following checks that need to cover before pushing the Attendance Punches:

1. Shift, Policy, and WeekOff should be assigned to the employees prior.
2. If the Attendance punches are pushed outside the buffer limit (when the buffer is enabled), then the system will ignore (not process)
   those Attendance data.
3. We need to pass the valid Employee ID(s). (Only the Employee IDs which are present in Darwinbox).
   When Directionality is disabled then on the front end only the first punch will come under Time In and the last punch will come under
   Time Out.
   When Directionality is enabled then on the front end first In-punch will come under Time In and the last-Out punch will come under
   Time Out.

#4
Assumptions
Any employee field that is blank or marked as "NA" will be reflected accordingly in the output file.
The Visteon Team is responsible for managing and maintaining all mandatory fields, as well as fields that must be marked as
mandatory based on the completion of other fields.

#5
Assumptions
The data sanity will be taken care of, in the Production instance, by Piramal HR team.
The fields required for the CIBIL integration must be mandatorily captured before initiating the pre-bgv (at the job application level or at pre-offer stage)
Pre-bgv is required to be initiated after pre offer stage.
