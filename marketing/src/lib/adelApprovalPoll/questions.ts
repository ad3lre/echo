export type PollOption = [label: string, score: number];

export type PollQuestion = {
  category: string;
  color: string;
  prompt: string;
  options: PollOption[];
};

export const ADEL_APPROVAL_QUESTIONS: PollQuestion[] = [
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'Mara is about to accept a job. Her closest friend thinks the company will be a bad fit, but Mara has been excited about it for weeks. What should the friend do?',
    options: [
      ['Tell Mara the concern once, clearly, and let her decide.', 4],
      ['Say nothing unless Mara asks for an opinion.', 1],
      ['Keep raising the concern until Mara changes her mind.', 2],
      [
        'Focus on supporting Mara’s excitement, even if the concern remains.',
        0,
      ],
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'During a group call, Leo jokes about a mistake Nina made months ago. Nina laughs, but later says it bothered her. What should happen next?',
    options: [
      [
        'Leo should stop using that subject, and the friendship can continue normally.',
        3,
      ],
      [
        'Nina should accept that close friends sometimes use personal material.',
        4,
      ],
      ['The group should avoid jokes about anyone’s mistakes from now on.', 0],
      [
        'Leo and Nina should agree on a private list of topics that are off-limits.',
        2,
      ],
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'Two old friends strongly disagree about a third friend’s behavior. Neither can persuade the other. What is the best next step?',
    options: [
      ['Keep discussing it until they reach the same conclusion.', 2],
      ['Avoid the third friend together until the facts are clearer.', 1],
      ['Leave the disagreement unresolved and continue the friendship.', 4],
      [
        'Take some distance from each other because the disagreement affects trust.',
        0,
      ],
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'Sam disappears for three weeks during a difficult period and answers nobody. When he returns, he wants everything to continue as before. How should his close friends respond?',
    options: [
      ['Welcome him back without asking for an explanation.', 3],
      ['Give him the same distance he gave them.', 0],
      ['Tell him the silence broke trust and require regular check-ins.', 1],
      ['Ask what happened, then decide whether anything needs to change.', 4],
    ],
  },
  {
    category: 'Friendship',
    color: '#ffb86b',
    prompt:
      'A friend sends you a long message at 2 a.m. saying they need to talk. You have work early and do not think it is an emergency. What do you do?',
    options: [
      ['Stay up and talk until they feel settled.', 4],
      ['Reply briefly and arrange a time the next day.', 2],
      ['Do not answer until morning.', 1],
      ['Ask them to contact someone else who is awake.', 0],
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'At dinner, one person tells a joke about a topic another guest has personal experience with. The guest says nothing, but becomes quiet. What should the host do?',
    options: [
      ['Change the subject without drawing attention to it.', 2],
      ['Let the conversation continue unless the guest says something.', 4],
      ['Pause the table and ask whether anyone wants the joke addressed.', 0],
      ['Ask the guest privately afterward whether the joke was a problem.', 3],
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'A comedian performs the same controversial joke in a private club and on a public school stage. Should the judgment be the same?',
    options: [
      ['Yes. The content matters more than the setting.', 1],
      ['Only the age of the audience should matter.', 2],
      ['No. The audience and setting change what is reasonable.', 4],
      ['The joke should be judged only by whether people laughed.', 3],
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'During a tense meeting, someone makes a joke that gets everyone laughing but delays the decision by a few minutes. How should the chair react?',
    options: [
      ['End the meeting and reschedule once people are calmer.', 2],
      ['Stop the joke quickly so the meeting keeps its tone.', 1],
      ['Allow it only if the person apologizes for interrupting.', 0],
      ['Let the moment happen, then return to the decision.', 4],
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'Kai often teases his friends and expects them to tease him back. A new person joins the group and takes one comment literally. What should Kai do?',
    options: [
      [
        'Keep acting normally and let the new person learn the group over time.',
        4,
      ],
      [
        'Explain the group’s style and ask what the new person is comfortable with.',
        3,
      ],
      ['Stop teasing whenever the new person is present.', 0],
      ['Ask the group to vote on whether the comment crossed a line.', 1],
    ],
  },
  {
    category: 'Humor',
    color: '#ff80ad',
    prompt:
      'A friend posts an embarrassing photo of herself because she finds it funny. Another friend says she is damaging how people see her. Which response makes most sense?',
    options: [
      ['Delete it; public image has long-term effects.', 0],
      ['Keep it if the laugh matters more to her than the impression.', 4],
      ['Move it to a private account where only friends can see it.', 2],
      ['Leave it up briefly, then remove it before it spreads.', 1],
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A doctor recommends a treatment. The patient finds a smaller study suggesting another option may work better for people like him. What should he do?',
    options: [
      [
        'Follow the doctor’s recommendation because the doctor knows the field.',
        1,
      ],
      ['Choose the study’s option because it is more specific to him.', 2],
      ['Bring the study to the doctor and compare the reasoning together.', 4],
      [
        'Delay treatment until he can personally review most of the research.',
        3,
      ],
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A company’s security team says a new system is safe. A junior engineer points to one failure mode the team has not tested. What should management do?',
    options: [
      ['Launch on schedule and monitor for the failure afterward.', 1],
      ['Let customers decide whether the untested risk is acceptable.', 2],
      ['Ask the security team whether the junior engineer is qualified.', 0],
      ['Delay the launch until that failure mode is tested.', 4],
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A news story is supported by five major outlets, while one independent reporter presents documents that appear to contradict it. What should a reader do first?',
    options: [
      ['Examine the documents and how each side explains them.', 4],
      ['Trust the five outlets unless they issue corrections.', 0],
      ['Trust the independent reporter because documents beat reporting.', 3],
      ['Wait until a clear public consensus forms.', 1],
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'A student has a strong theory about why a historical event happened, but it conflicts with the textbook. What should the teacher require?',
    options: [
      [
        'Use the textbook answer for the assignment and discuss the theory separately.',
        2,
      ],
      ['Support the theory with evidence and answer objections to it.', 4],
      ['Drop the theory unless a historian has already published it.', 0],
      ['Present both views without choosing between them.', 1],
    ],
  },
  {
    category: 'Thinking',
    color: '#7fd3ff',
    prompt:
      'Your friend confidently explains a technical subject you know little about. Later, two sources disagree with him. What do you do?',
    options: [
      ['Assume your friend probably knows context the sources missed.', 1],
      ['Stop trusting him on technical subjects.', 0],
      ['Ask him how he reached the claim and compare the evidence.', 4],
      ['Choose whichever source has the strongest credentials.', 2],
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'A landlord has had several costly problems with tenants from one student program. A new applicant from that program has excellent references. How should the application be handled?',
    options: [
      ['Reject the application to avoid repeating the risk.', 0],
      ['Require a larger deposit because of the prior pattern.', 1],
      [
        'Give the references extra scrutiny, but make an individual decision.',
        3,
      ],
      ['Use the same criteria as for every other applicant.', 4],
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'A twelve-year-old notices an error in a museum exhibit. The curator says the exhibit was reviewed by specialists. What should the museum do?',
    options: [
      ['Check the specific claim without considering the child’s age.', 4],
      ['Thank the child but keep the exhibit unchanged.', 0],
      ['Ask a second specialist before looking at the child’s evidence.', 2],
      [
        'Change the exhibit immediately because outsiders often catch mistakes.',
        3,
      ],
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'Police are searching for a missing child and have only a vague description of a car. How should they use it?',
    options: [
      ['Stop every car that roughly matches until the child is found.', 1],
      [
        'Use the description as one clue and look for additional matching details.',
        4,
      ],
      [
        'Do not use the description because many innocent drivers will match.',
        2,
      ],
      ['Share the description publicly but avoid stopping any cars.', 3],
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'An employee was rude in one recorded meeting. Online viewers now describe her as a cruel person. What conclusion is justified?',
    options: [
      ['The recording is enough to judge how she generally treats people.', 0],
      ['No judgment is possible because recordings lack context.', 2],
      [
        'The behavior in that meeting can be judged, but her whole character cannot.',
        4,
      ],
      ['Her employer should investigate whether similar incidents exist.', 3],
    ],
  },
  {
    category: 'Judgment',
    color: '#a99bff',
    prompt:
      'A school rule improves attendance overall but causes problems for students with irregular medical appointments. What should the school do?',
    options: [
      ['Keep the rule unchanged because consistency matters.', 0],
      ['Remove attendance penalties for every student.', 1],
      ['Replace the rule with teacher-by-teacher judgment.', 2],
      ['Keep the rule and create an individual review process.', 4],
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'After a conversation, Priya says, “I felt ignored, so you were disrespecting me.” The other person says they were distracted by bad news. What should they establish first?',
    options: [
      ['Whether the behavior reasonably showed disrespect in context.', 4],
      ['Whether Priya’s feeling was genuine.', 1],
      ['Whether the other person intended to hurt her.', 3],
      ['Who became more upset during the conversation.', 0],
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'A coworker cries after receiving direct criticism of their work. What should the manager do next?',
    options: [
      ['Withdraw the criticism and revisit it only if the coworker asks.', 0],
      ['Give them time, then continue discussing the work itself.', 4],
      ['Replace the criticism with general encouragement.', 1],
      ['Continue immediately so emotion does not affect the process.', 3],
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'A friend repeatedly avoids crowded places because they feel anxious there. The group is planning a concert. What should the group do?',
    options: [
      ['Choose a different activity so everyone can join.', 1],
      ['Plan separate events every time so nobody has to choose.', 2],
      ['Invite the friend, accept their answer, and keep the concert plan.', 4],
      [
        'Encourage the friend to attend because avoiding crowds may reinforce the fear.',
        3,
      ],
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'During an argument, one partner becomes too upset to continue clearly. What should happen?',
    options: [
      ['Continue until the disagreement is fully resolved.', 3],
      ['End the issue unless both people bring it up again.', 1],
      ['Let the more upset partner decide the outcome for now.', 0],
      ['Pause and return to the same issue at an agreed time.', 4],
    ],
  },
  {
    category: 'Emotion',
    color: '#65dec6',
    prompt:
      'Someone says a film harmed them emotionally and asks a discussion group not to show it again. What should the group consider most?',
    options: [
      [
        'How central the film is to the group’s purpose and what alternatives exist.',
        4,
      ],
      ['The request itself should be enough.', 0],
      ['Whether most members had a positive reaction to the film.', 2],
      ['Whether the person can explain exactly why the film affected them.', 3],
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A city can reduce late-night assaults by closing all bars at 10 p.m. The policy would also end much of the city’s nightlife. What should it do?',
    options: [
      ['Close the bars; preventing assaults comes first.', 0],
      [
        'Keep current hours and target the places where incidents actually occur.',
        4,
      ],
      ['Set a midnight closing time as a compromise.', 2],
      ['Let each neighborhood vote on its own closing time.', 3],
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A university speaker is expected to express views many students consider insulting. There is no threat of violence. What should the university do?',
    options: [
      ['Cancel the event to protect students from a hostile environment.', 0],
      ['Move the event online so attendance is fully optional.', 2],
      ['Hold the event and allow peaceful protest outside.', 4],
      ['Require the speaker to submit the speech for approval first.', 1],
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A government benefit guarantees everyone a basic income but requires much higher taxes on successful small businesses. Which tradeoff is preferable?',
    options: [
      ['Guarantee the income even if some businesses shrink.', 0],
      ['Use a smaller benefit with lower taxes.', 2],
      ['Let each region choose its own system.', 3],
      [
        'Keep taxes low and rely more on voluntary work, family, and private support.',
        4,
      ],
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'An adult wants to try an experimental treatment with serious risks after standard treatments failed. Regulators have not approved it. What should happen?',
    options: [
      [
        'The adult should be allowed to choose after receiving the known risks.',
        4,
      ],
      ['Only a doctor should be allowed to make the final decision.', 1],
      ['The treatment should remain unavailable until formal approval.', 0],
      ['A review panel should decide case by case.', 3],
    ],
  },
  {
    category: 'Freedom',
    color: '#ffd166',
    prompt:
      'A town can install cameras on every main street and likely solve more crimes. The footage would be stored for five years. What should it do?',
    options: [
      ['Install them; public spaces are already visible to others.', 0],
      ['Do not create a permanent record of everyone’s movements.', 4],
      [
        'Install fewer cameras and delete footage quickly unless it is tied to a case.',
        2,
      ],
      ['Let residents opt out by registering their faces.', 1],
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'In a voice chat, one member regularly speaks for ten minutes without leaving room for others. The member does not notice people leaving. What should the group do?',
    options: [
      ['The group should create a fixed speaking-time rule for everyone.', 2],
      ['People should interrupt whenever they want to speak.', 3],
      [
        'A moderator should privately explain the pattern and set a clear limit.',
        4,
      ],
      ['Say nothing; leaving the call already communicates the problem.', 0],
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A long-time member publicly says the community’s founders are untrustworthy and the project should move in a different direction. What should happen?',
    options: [
      ['Ask the member to make criticism privately but allow them to stay.', 3],
      ['Keep the member as long as they follow ordinary behavior rules.', 1],
      ['Hold a community vote on the founders and the project direction.', 2],
      ['Remove the member because the basic direction is no longer shared.', 4],
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A new member is friendly but repeatedly turns casual conversations into political debates. Several regulars stop joining. How should moderators respond?',
    options: [
      ['Ask the new member to keep politics to designated places.', 4],
      ['Let regulars mute or avoid the member individually.', 2],
      ['Ban political topics for everyone.', 1],
      ['Do nothing unless the debates include insults.', 0],
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A member often speaks negatively about themselves, and others spend much of each evening reassuring them. What should the group do?',
    options: [
      [
        'Keep reassuring them because close communities support members through difficult periods.',
        1,
      ],
      [
        'Offer support, but stop making the group responsible for repeating the same reassurance.',
        4,
      ],
      ['Ask them not to discuss personal problems in the group.', 2],
      ['Assign one person to check on them privately.', 3],
    ],
  },
  {
    category: 'Community',
    color: '#f59e7b',
    prompt:
      'A private club was created around a specific culture and style. Most new applicants prefer a calmer, more formal atmosphere. Should the club change?',
    options: [
      [
        'Yes, because a community should reflect the people currently joining it.',
        1,
      ],
      ['Create separate spaces for the two styles.', 3],
      [
        'Keep the original culture and let applicants decide whether it suits them.',
        4,
      ],
      ['Let all members vote once a year on the club’s identity.', 2],
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'A couple plans to have children. One partner wants one person to focus mainly on earning and the other mainly on the home. What is the best basis for deciding?',
    options: [
      ['Avoid fixed roles and renegotiate every task week by week.', 0],
      ['Split paid work and home work as evenly as possible.', 1],
      [
        'Choose whichever arrangement produces the highest household income.',
        2,
      ],
      [
        'Use the arrangement each person naturally prefers, even if the roles are traditional.',
        4,
      ],
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'One partner researches every major purchase and usually makes better decisions. The other dislikes feeling overruled. How should they handle final decisions?',
    options: [
      [
        'The better-informed partner should usually lead, while explaining the reasoning.',
        4,
      ],
      ['Each person should have an equal veto over every major purchase.', 2],
      ['Alternate who gets the final decision.', 1],
      ['Keep finances separate so neither person can overrule the other.', 0],
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'A woman in a serious relationship has a close male friend she meets alone every week. Her partner is uncomfortable but has no evidence of cheating. What should happen?',
    options: [
      ['She should continue; trust means not restricting friendships.', 0],
      [
        'She should reduce the private closeness if the relationship is meant to come first.',
        4,
      ],
      [
        'They should discuss boundaries and find an arrangement both can live with.',
        2,
      ],
      [
        'Her partner should meet the friend and decide whether he seems trustworthy.',
        3,
      ],
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'A couple’s families strongly oppose their relationship and keep warning one partner to leave. The couple themselves remain happy. How much weight should the warnings carry?',
    options: [
      ['A lot; families often see risks that couples miss.', 0],
      ['Some; examine the claims, but the couple makes the decision.', 3],
      ['Very little unless the warnings contain specific evidence.', 4],
      ['None; family opinions should never enter a relationship.', 2],
    ],
  },
  {
    category: 'Relationships',
    color: '#e98dff',
    prompt:
      'Two partners agree on most goals, but one changes political beliefs in a major way. What should matter most?',
    options: [
      [
        'Whether the new beliefs change how they treat each other or plan their life.',
        3,
      ],
      ['The partner who changed should keep those beliefs private.', 0],
      ['The relationship should be separate from politics.', 1],
      [
        'Whether the beliefs still fit the values the relationship was built around.',
        4,
      ],
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'After two weeks of dating, both people want to spend nearly every day together. Their friends say they are moving too fast. What should they do?',
    options: [
      [
        'Continue if both want it and remain honest about what they are choosing.',
        4,
      ],
      ['Slow down because intensity can hide incompatibility.', 1],
      [
        'Set a fixed limit on how often they meet for the first three months.',
        0,
      ],
      ['Ignore everyone and combine their lives immediately.', 3],
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'One partner wants to share passwords, location, and nearly every part of daily life. The other prefers more privacy. What arrangement makes most sense?',
    options: [
      ['Keep accounts and location private by default.', 0],
      [
        'Aim for broad openness because the relationship should become deeply integrated.',
        4,
      ],
      [
        'Share only what both people freely choose, without treating privacy as evidence of disloyalty.',
        2,
      ],
      ['Share everything except financial accounts.', 3],
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'A couple can afford only one of two jobs: one pays much more but keeps them apart most weeks; the other pays less but lets them live together. Which should they choose?',
    options: [
      ['Take the higher-paying job and protect their future.', 1],
      ['Try the higher-paying job for a year, then reconsider.', 3],
      [
        'Choose the job that keeps them together if basic needs are still covered.',
        4,
      ],
      [
        'Each person should choose separately without making the relationship the deciding factor.',
        0,
      ],
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'One partner wants to discuss every disagreement immediately. The other needs a day alone before talking. What should they do?',
    options: [
      ['Let whichever partner is more upset choose the timing.', 1],
      ['Always wait a full day before discussing conflict.', 0],
      ['Agree on a short pause with a specific time to return.', 3],
      ['Discuss it immediately so distance does not grow.', 4],
    ],
  },
  {
    category: 'Closeness',
    color: '#7ee0a1',
    prompt:
      'A partner receives a life-changing opportunity abroad. The other partner’s career cannot easily move. What should decide the outcome?',
    options: [
      [
        'The relationship should win if both see it as their primary life commitment.',
        4,
      ],
      ['The opportunity should win because it may not return.', 1],
      [
        'They should live apart and avoid asking either person to sacrifice.',
        2,
      ],
      ['The person with the stronger career prospects should decide.', 3],
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'A carefully planned trip is disrupted by a canceled train, lost reservation, and sudden rain. What response is most natural?',
    options: [
      ['Rebuild the plan before doing anything else.', 1],
      [
        'Pick the best available option and treat the disruption as part of the trip.',
        4,
      ],
      ['End the trip early before more goes wrong.', 0],
      ['Let someone else decide because planning has already failed.', 2],
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'At work, a colleague points out your mistake in front of the team and is correct. What do you do first?',
    options: [
      ['Explain the circumstances so the team has the full context.', 3],
      ['Ask to discuss feedback privately in the future.', 2],
      ['Acknowledge the mistake and move to fixing it.', 4],
      ['Say nothing in the meeting and address the colleague afterward.', 1],
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'Someone you know succeeds at something you have tried to achieve for years. They celebrate it openly. What is your first response?',
    options: [
      ['Point out the advantages that helped them succeed.', 0],
      [
        'Congratulate them, but take some distance until the feeling passes.',
        2,
      ],
      ['Avoid the subject so you do not say something insincere.', 1],
      ['Congratulate them and ask how they did it.', 4],
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'You discover that a belief central to your identity is probably wrong. What should happen next?',
    options: [
      ['Change the belief publicly and explain what changed your mind.', 4],
      ['Change it privately and avoid reopening old arguments.', 2],
      [
        'Wait for more evidence because identity-level changes should be slow.',
        3,
      ],
      [
        'Keep the belief if abandoning it would damage important relationships.',
        0,
      ],
    ],
  },
  {
    category: 'Temperament',
    color: '#60d4ff',
    prompt:
      'You can choose between a stable life with few major surprises and an uncertain life built around ambitious projects. Both would cover your basic needs. Which do you choose?',
    options: [
      ['The stable life, because freedom depends on security.', 0],
      ['The uncertain life, if the projects feel worth pursuing.', 4],
      ['Mostly stable, with one ambitious project at a time.', 2],
      ['Whichever option earns more social respect.', 1],
    ],
  },
];

export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  ADEL_APPROVAL_QUESTIONS.map((q) => [q.category, q.color]),
);
