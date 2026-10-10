import { ADEL_APPROVAL_SCORE_WEIGHTS } from '../../../../contracts/marketingPollScoring';

export type PollOption = [label: string, score: number];

export type PollQuestion = {
  category: string;
  color: string;
  prompt: string;
  options: PollOption[];
};

const QUESTION_LABELS: (Omit<PollQuestion, 'options'> & {
  options: string[];
})[] = [
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'Mara is about to accept a job. Her closest friend thinks the company will be a bad fit, but Mara has been excited about it for weeks. What should the friend do?',
    options: [
      'Tell Mara the concern once, clearly, and let her decide.',
      'Say nothing unless Mara asks for an opinion.',
      'Keep raising the concern until Mara changes her mind.',
      'Focus on supporting Mara’s excitement, even if the concern remains.',
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'During a group call, Leo jokes about a mistake Nina made months ago. Nina laughs, but later says it bothered her. What should happen next?',
    options: [
      'Leo should stop using that subject, and the friendship can continue normally.',
      'Nina should accept that close friends sometimes use personal material.',
      'The group should avoid jokes about anyone’s mistakes from now on.',
      'Leo and Nina should agree on a private list of topics that are off-limits.',
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'Two old friends strongly disagree about a third friend’s behavior. Neither can persuade the other. What is the best next step?',
    options: [
      'Keep discussing it until they reach the same conclusion.',
      'Avoid the third friend together until the facts are clearer.',
      'Leave the disagreement unresolved and continue the friendship.',
      'Take some distance from each other because the disagreement affects trust.',
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'Sam disappears for three weeks during a difficult period and answers nobody. When he returns, he wants everything to continue as before. How should his close friends respond?',
    options: [
      'Welcome him back without asking for an explanation.',
      'Give him the same distance he gave them.',
      'Tell him the silence broke trust and require regular check-ins.',
      'Ask what happened, then decide whether anything needs to change.',
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'A friend sends you a long message at 2 a.m. saying they need to talk. You have work early and do not think it is an emergency. What do you do?',
    options: [
      'Stay up and talk until they feel settled.',
      'Reply briefly and arrange a time the next day.',
      'Do not answer until morning.',
      'Ask them to contact someone else who is awake.',
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'At dinner, one person tells a joke about a topic another guest has personal experience with. The guest says nothing, but becomes quiet. What should the host do?',
    options: [
      'Change the subject without drawing attention to it.',
      'Let the conversation continue unless the guest says something.',
      'Pause the table and ask whether anyone wants the joke addressed.',
      'Ask the guest privately afterward whether the joke was a problem.',
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'A comedian performs the same controversial joke in a private club and on a public school stage. Should the judgment be the same?',
    options: [
      'Yes. The content matters more than the setting.',
      'Only the age of the audience should matter.',
      'No. The audience and setting change what is reasonable.',
      'The joke should be judged only by whether people laughed.',
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'During a tense meeting, someone makes a joke that gets everyone laughing but delays the decision by a few minutes. How should the chair react?',
    options: [
      'End the meeting and reschedule once people are calmer.',
      'Stop the joke quickly so the meeting keeps its tone.',
      'Allow it only if the person apologizes for interrupting.',
      'Let the moment happen, then return to the decision.',
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'Kai often teases his friends and expects them to tease him back. A new person joins the group and takes one comment literally. What should Kai do?',
    options: [
      'Keep acting normally and let the new person learn the group over time.',
      'Explain the group’s style and ask what the new person is comfortable with.',
      'Stop teasing whenever the new person is present.',
      'Ask the group to vote on whether the comment crossed a line.',
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'A friend posts an embarrassing photo of herself because she finds it funny. Another friend says she is damaging how people see her. Which response makes most sense?',
    options: [
      'Delete it; public image has long-term effects.',
      'Keep it if the laugh matters more to her than the impression.',
      'Move it to a private account where only friends can see it.',
      'Leave it up briefly, then remove it before it spreads.',
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A doctor recommends a treatment. The patient finds a smaller study suggesting another option may work better for people like him. What should he do?',
    options: [
      'Follow the doctor’s recommendation because the doctor knows the field.',
      'Choose the study’s option because it is more specific to him.',
      'Bring the study to the doctor and compare the reasoning together.',
      'Delay treatment until he can personally review most of the research.',
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A company’s security team says a new system is safe. A junior engineer points to one failure mode the team has not tested. What should management do?',
    options: [
      'Launch on schedule and monitor for the failure afterward.',
      'Let customers decide whether the untested risk is acceptable.',
      'Ask the security team whether the junior engineer is qualified.',
      'Delay the launch until that failure mode is tested.',
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A news story is supported by five major outlets, while one independent reporter presents documents that appear to contradict it. What should a reader do first?',
    options: [
      'Examine the documents and how each side explains them.',
      'Trust the five outlets unless they issue corrections.',
      'Trust the independent reporter because documents beat reporting.',
      'Wait until a clear public consensus forms.',
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A student has a strong theory about why a historical event happened, but it conflicts with the textbook. What should the teacher require?',
    options: [
      'Use the textbook answer for the assignment and discuss the theory separately.',
      'Support the theory with evidence and answer objections to it.',
      'Drop the theory unless a historian has already published it.',
      'Present both views without choosing between them.',
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'Your friend confidently explains a technical subject you know little about. Later, two sources disagree with him. What do you do?',
    options: [
      'Assume your friend probably knows context the sources missed.',
      'Stop trusting him on technical subjects.',
      'Ask him how he reached the claim and compare the evidence.',
      'Choose whichever source has the strongest credentials.',
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'A landlord has had several costly problems with tenants from one student program. A new applicant from that program has excellent references. How should the application be handled?',
    options: [
      'Reject the application to avoid repeating the risk.',
      'Require a larger deposit because of the prior pattern.',
      'Give the references extra scrutiny, but make an individual decision.',
      'Use the same criteria as for every other applicant.',
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'A twelve-year-old notices an error in a museum exhibit. The curator says the exhibit was reviewed by specialists. What should the museum do?',
    options: [
      'Check the specific claim without considering the child’s age.',
      'Thank the child but keep the exhibit unchanged.',
      'Ask a second specialist before looking at the child’s evidence.',
      'Change the exhibit immediately because outsiders often catch mistakes.',
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'Police are searching for a missing child and have only a vague description of a car. How should they use it?',
    options: [
      'Stop every car that roughly matches until the child is found.',
      'Use the description as one clue and look for additional matching details.',
      'Do not use the description because many innocent drivers will match.',
      'Share the description publicly but avoid stopping any cars.',
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'An employee was rude in one recorded meeting. Online viewers now describe her as a cruel person. What conclusion is justified?',
    options: [
      'The recording is enough to judge how she generally treats people.',
      'No judgment is possible because recordings lack context.',
      'The behavior in that meeting can be judged, but her whole character cannot.',
      'Her employer should investigate whether similar incidents exist.',
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'A school rule improves attendance overall but causes problems for students with irregular medical appointments. What should the school do?',
    options: [
      'Keep the rule unchanged because consistency matters.',
      'Remove attendance penalties for every student.',
      'Replace the rule with teacher-by-teacher judgment.',
      'Keep the rule and create an individual review process.',
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'After a conversation, Priya says, “I felt ignored, so you were disrespecting me.” The other person says they were distracted by bad news. What should they establish first?',
    options: [
      'Whether the behavior reasonably showed disrespect in context.',
      'Whether Priya’s feeling was genuine.',
      'Whether the other person intended to hurt her.',
      'Who became more upset during the conversation.',
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'A coworker cries after receiving direct criticism of their work. What should the manager do next?',
    options: [
      'Withdraw the criticism and revisit it only if the coworker asks.',
      'Give them time, then continue discussing the work itself.',
      'Replace the criticism with general encouragement.',
      'Continue immediately so emotion does not affect the process.',
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'A friend repeatedly avoids crowded places because they feel anxious there. The group is planning a concert. What should the group do?',
    options: [
      'Choose a different activity so everyone can join.',
      'Plan separate events every time so nobody has to choose.',
      'Invite the friend, accept their answer, and keep the concert plan.',
      'Encourage the friend to attend because avoiding crowds may reinforce the fear.',
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'During an argument, one partner becomes too upset to continue clearly. What should happen?',
    options: [
      'Continue until the disagreement is fully resolved.',
      'End the issue unless both people bring it up again.',
      'Let the more upset partner decide the outcome for now.',
      'Pause and return to the same issue at an agreed time.',
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'Someone says a film harmed them emotionally and asks a discussion group not to show it again. What should the group consider most?',
    options: [
      'How central the film is to the group’s purpose and what alternatives exist.',
      'The request itself should be enough.',
      'Whether most members had a positive reaction to the film.',
      'Whether the person can explain exactly why the film affected them.',
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A city can reduce late-night assaults by closing all bars at 10 p.m. The policy would also end much of the city’s nightlife. What should it do?',
    options: [
      'Close the bars; preventing assaults comes first.',
      'Keep current hours and target the places where incidents actually occur.',
      'Set a midnight closing time as a compromise.',
      'Let each neighborhood vote on its own closing time.',
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A university speaker is expected to express views many students consider insulting. There is no threat of violence. What should the university do?',
    options: [
      'Cancel the event to protect students from a hostile environment.',
      'Move the event online so attendance is fully optional.',
      'Hold the event and allow peaceful protest outside.',
      'Require the speaker to submit the speech for approval first.',
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A government benefit guarantees everyone a basic income but requires much higher taxes on successful small businesses. Which tradeoff is preferable?',
    options: [
      'Guarantee the income even if some businesses shrink.',
      'Use a smaller benefit with lower taxes.',
      'Let each region choose its own system.',
      'Keep taxes low and rely more on voluntary work, family, and private support.',
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'An adult wants to try an experimental treatment with serious risks after standard treatments failed. Regulators have not approved it. What should happen?',
    options: [
      'The adult should be allowed to choose after receiving the known risks.',
      'Only a doctor should be allowed to make the final decision.',
      'The treatment should remain unavailable until formal approval.',
      'A review panel should decide case by case.',
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A town can install cameras on every main street and likely solve more crimes. The footage would be stored for five years. What should it do?',
    options: [
      'Install them; public spaces are already visible to others.',
      'Do not create a permanent record of everyone’s movements.',
      'Install fewer cameras and delete footage quickly unless it is tied to a case.',
      'Let residents opt out by registering their faces.',
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'In a voice chat, one member regularly speaks for ten minutes without leaving room for others. The member does not notice people leaving. What should the group do?',
    options: [
      'The group should create a fixed speaking-time rule for everyone.',
      'People should interrupt whenever they want to speak.',
      'A moderator should privately explain the pattern and set a clear limit.',
      'Say nothing; leaving the call already communicates the problem.',
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A long-time member publicly says the community’s founders are untrustworthy and the project should move in a different direction. What should happen?',
    options: [
      'Ask the member to make criticism privately but allow them to stay.',
      'Keep the member as long as they follow ordinary behavior rules.',
      'Hold a community vote on the founders and the project direction.',
      'Remove the member because the basic direction is no longer shared.',
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A new member is friendly but repeatedly turns casual conversations into political debates. Several regulars stop joining. How should moderators respond?',
    options: [
      'Ask the new member to keep politics to designated places.',
      'Let regulars mute or avoid the member individually.',
      'Ban political topics for everyone.',
      'Do nothing unless the debates include insults.',
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A member often speaks negatively about themselves, and others spend much of each evening reassuring them. What should the group do?',
    options: [
      'Keep reassuring them because close communities support members through difficult periods.',
      'Offer support, but stop making the group responsible for repeating the same reassurance.',
      'Ask them not to discuss personal problems in the group.',
      'Assign one person to check on them privately.',
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A private club was created around a specific culture and style. Most new applicants prefer a calmer, more formal atmosphere. Should the club change?',
    options: [
      'Yes, because a community should reflect the people currently joining it.',
      'Create separate spaces for the two styles.',
      'Keep the original culture and let applicants decide whether it suits them.',
      'Let all members vote once a year on the club’s identity.',
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'A couple plans to have children. One partner wants one person to focus mainly on earning and the other mainly on the home. What is the best basis for deciding?',
    options: [
      'Avoid fixed roles and renegotiate every task week by week.',
      'Split paid work and home work as evenly as possible.',
      'Choose whichever arrangement produces the highest household income.',
      'Use the arrangement each person naturally prefers, even if the roles are traditional.',
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'One partner researches every major purchase and usually makes better decisions. The other dislikes feeling overruled. How should they handle final decisions?',
    options: [
      'The better-informed partner should usually lead, while explaining the reasoning.',
      'Each person should have an equal veto over every major purchase.',
      'Alternate who gets the final decision.',
      'Keep finances separate so neither person can overrule the other.',
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'A woman in a serious relationship has a close male friend she meets alone every week. Her partner is uncomfortable but has no evidence of cheating. What should happen?',
    options: [
      'She should continue; trust means not restricting friendships.',
      'She should reduce the private closeness if the relationship is meant to come first.',
      'They should discuss boundaries and find an arrangement both can live with.',
      'Her partner should meet the friend and decide whether he seems trustworthy.',
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'A couple’s families strongly oppose their relationship and keep warning one partner to leave. The couple themselves remain happy. How much weight should the warnings carry?',
    options: [
      'A lot; families often see risks that couples miss.',
      'Some; examine the claims, but the couple makes the decision.',
      'Very little unless the warnings contain specific evidence.',
      'None; family opinions should never enter a relationship.',
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'Two partners agree on most goals, but one changes political beliefs in a major way. What should matter most?',
    options: [
      'Whether the new beliefs change how they treat each other or plan their life.',
      'The partner who changed should keep those beliefs private.',
      'The relationship should be separate from politics.',
      'Whether the beliefs still fit the values the relationship was built around.',
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'After two weeks of dating, both people want to spend nearly every day together. Their friends say they are moving too fast. What should they do?',
    options: [
      'Continue if both want it and remain honest about what they are choosing.',
      'Slow down because intensity can hide incompatibility.',
      'Set a fixed limit on how often they meet for the first three months.',
      'Ignore everyone and combine their lives immediately.',
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'One partner wants to share passwords, location, and nearly every part of daily life. The other prefers more privacy. What arrangement makes most sense?',
    options: [
      'Keep accounts and location private by default.',
      'Aim for broad openness because the relationship should become deeply integrated.',
      'Share only what both people freely choose, without treating privacy as evidence of disloyalty.',
      'Share everything except financial accounts.',
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'A couple can afford only one of two jobs: one pays much more but keeps them apart most weeks; the other pays less but lets them live together. Which should they choose?',
    options: [
      'Take the higher-paying job and protect their future.',
      'Try the higher-paying job for a year, then reconsider.',
      'Choose the job that keeps them together if basic needs are still covered.',
      'Each person should choose separately without making the relationship the deciding factor.',
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'One partner wants to discuss every disagreement immediately. The other needs a day alone before talking. What should they do?',
    options: [
      'Let whichever partner is more upset choose the timing.',
      'Always wait a full day before discussing conflict.',
      'Agree on a short pause with a specific time to return.',
      'Discuss it immediately so distance does not grow.',
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'A partner receives a life-changing opportunity abroad. The other partner’s career cannot easily move. What should decide the outcome?',
    options: [
      'The relationship should win if both see it as their primary life commitment.',
      'The opportunity should win because it may not return.',
      'They should live apart and avoid asking either person to sacrifice.',
      'The person with the stronger career prospects should decide.',
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'A carefully planned trip is disrupted by a canceled train, lost reservation, and sudden rain. What response is most natural?',
    options: [
      'Rebuild the plan before doing anything else.',
      'Pick the best available option and treat the disruption as part of the trip.',
      'End the trip early before more goes wrong.',
      'Let someone else decide because planning has already failed.',
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'At work, a colleague points out your mistake in front of the team and is correct. What do you do first?',
    options: [
      'Explain the circumstances so the team has the full context.',
      'Ask to discuss feedback privately in the future.',
      'Acknowledge the mistake and move to fixing it.',
      'Say nothing in the meeting and address the colleague afterward.',
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'Someone you know succeeds at something you have tried to achieve for years. They celebrate it openly. What is your first response?',
    options: [
      'Point out the advantages that helped them succeed.',
      'Congratulate them, but take some distance until the feeling passes.',
      'Avoid the subject so you do not say something insincere.',
      'Congratulate them and ask how they did it.',
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'You discover that a belief central to your identity is probably wrong. What should happen next?',
    options: [
      'Change the belief publicly and explain what changed your mind.',
      'Change it privately and avoid reopening old arguments.',
      'Wait for more evidence because identity-level changes should be slow.',
      'Keep the belief if abandoning it would damage important relationships.',
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'You can choose between a stable life with few major surprises and an uncertain life built around ambitious projects. Both would cover your basic needs. Which do you choose?',
    options: [
      'The stable life, because freedom depends on security.',
      'The uncertain life, if the projects feel worth pursuing.',
      'Mostly stable, with one ambitious project at a time.',
      'Whichever option earns more social respect.',
    ],
  },
];

export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  ADEL_APPROVAL_QUESTIONS.map((q) => [q.category, q.color]),
);

export const ADEL_APPROVAL_QUESTIONS: PollQuestion[] = QUESTION_LABELS.map(
  (question, index) => ({
    ...question,
    options: question.options.map((label, option) => [
      label,
      ADEL_APPROVAL_SCORE_WEIGHTS[index]!.scores[option]!,
    ]),
  }),
);
